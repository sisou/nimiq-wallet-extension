/* jshint esversion: 6 */

var $sandbox = document.getElementById('sandbox');

// Overwrite test functions that use eval to route the tests into the sandbox
Nimiq._hasNativeClassSupport = async function() {
    var message = {
        command: '_hasNativeClassSupport'
    };
    $sandbox.contentWindow.postMessage(message, '*');

    return new Promise(function(resolve, reject) {
        window.addEventListener('message', function(event) {
            if (event.data.command === message.command) {
                resolve(event.data.result);
            }
        });
    });
}

Nimiq._hasAsyncAwaitSupport = async function() {
    var message = {
        command: '_hasAsyncAwaitSupport'
    };
    $sandbox.contentWindow.postMessage(message, '*');

    return new Promise(function(resolve, reject) {
        window.addEventListener('message', function(event) {
            if (event.data.command === message.command) {
                resolve(event.data.result);
            }
        });
    });
}

Nimiq._hasProperScoping = async function() {
    var message = {
        command: '_hasProperScoping'
    };
    $sandbox.contentWindow.postMessage(message, '*');

    return new Promise(function(resolve, reject) {
        window.addEventListener('message', function(event) {
            if (event.data.command === message.command) {
                resolve(event.data.result);
            }
        });
    });
}

// #####################################################################################################################
// #####################################################################################################################
// #####################################################################################################################

var state = {
    activeWallet: {
        name: 'loading...',
        address: '',
        balance: 'loading...',
        history: []
    },
    numberOfWallets: 0,
    height: 0,
    targetHeight: 0,
    peers: 0,
    status: 'Not connected',
    mining: false,
    hashrate: 0,
    pendingTxs: [],
    analysingHistory: [], // Store all addresses that are currently being analysed
    postponedBlocks: []
};

function updateState(update) {
    Object.assign(state, update);
    chrome.runtime.sendMessage(update);
}

function _onConsensusEstablished() {
    console.log('Consensus established');
    updateState({status: 'Consensus established'});
    updateState({targetHeight: 0});

    // Get current balance and initiate listener.
    $.accounts.getBalance($.wallet.address).then(balance => _onBalanceChanged(balance));
    $.accounts.on($.wallet.address, account => _onBalanceChanged(account.balance));

    // If we want to start mining.
    // $.miner.startWork();
}

function _onConsensusLost() {
    console.log('Consensus lost');
    updateState({status: 'Consensus lost'});
    stopMining();
}

function startMining() {
    if($.consensus.established) {
        $.miner.startWork();
        updateState({mining: $.miner.working});
    }
}

function stopMining() {
    $.miner.stopWork();
    updateState({mining: $.miner.working});
    updateState({hashrate: 0});
}

function _onBalanceChanged(newBalance) {
    console.log(`Balance is ${Nimiq.Policy.satoshisToCoins(newBalance.value)}.`);
    updateState({activeWallet: {
        name: state.activeWallet.name,
        address: state.activeWallet.address,
        balance: Nimiq.Policy.satoshisToCoins(newBalance.value)
    }});
}

async function _onHeadChanged(triggeredManually) {
    console.log(`Now at height #${$.blockchain.height}.`);
    await analyseBlock($.blockchain.head, null, triggeredManually);
    updateState({height: $.blockchain.height});
}

function _onPeersChanged() {
    console.log(`Connected to ${$.network.peerCount} peers (WebSocket: ${$.network.peerCountWebSocket}, WebRTC: ${$.network.peerCountWebRtc})`);
    updateState({peers: $.network.peerCount});
}

async function _mempoolChanged() {
    var txs = $.mempool.getTransactions();

    var pendingTxs = [];

    for (var tx of txs) {
        var sender   = (await tx.getSenderAddr()).toHex(),
            receiver = tx.recipientAddr.toHex();

        if([sender, receiver].includes(state.activeWallet.address)) {
            pendingTxs.push({
                address : sender === state.activeWallet.address ? receiver : sender,
                value: Nimiq.Policy.satoshisToCoins(tx.value),
                type: sender === state.activeWallet.address ? 'sending' : 'receiving'
                // message: null, // TODO Fill when available
                // fee: Nimiq.Policy.satoshisToCoins(tx.fee),
                // nonce: tx.nonce
            });
        }
    }

    updateState({pendingTxs: pendingTxs});
}

function startNimiq(params) {
    updateState({status: 'Connecting'});

    var defaults = {};

    var options = Object.assign({}, defaults, params);

    Nimiq.init(async $ => {
        console.log('Nimiq loaded. Connecting and establishing consensus.');

        window.$ = $;

        console.log('Your address: ' + $.wallet.address.toHex());

        store.get('wallets', function(items) {
            var wallets = items.wallets;

            updateState({activeWallet: {
                name: wallets[$.wallet.address.toHex()].name,
                address: $.wallet.address.toHex(),
                balance: state.activeWallet.balance
            }});
        });

        $.consensus.on('syncing', (targetHeight) => {
            updateState({status: 'Syncing'});
            updateState({targetHeight: targetHeight});
        });
        $.consensus.on('established', () => _onConsensusEstablished());
        $.consensus.on('lost', () => _onConsensusLost());

        var analysedHeight = await new Promise(function(resolve, reject) {
            store.get('analysedHeight', function(items) {
                resolve(items.analysedHeight);
            });
        });

        await analyseHistory(analysedHeight + 1, $.blockchain.height);

        $.blockchain.on('head-changed', () => _onHeadChanged());
        _onHeadChanged(true);

        $.miner.on('hashrate-changed', () => {
            updateState({hashrate: $.miner.hashrate});
        });

        $.network.on('peers-changed', () => _onPeersChanged());

        $.mempool.on('*', () => _mempoolChanged());
        _mempoolChanged();

        $.network.connect();
    }, function(error) {
        updateState({status: 'Not connected'});
        console.error(error);
    }, options);
}

function messageReceived(msg) {
    console.log("message received:", msg);
}
chrome.runtime.onMessage.addListener(messageReceived);

var store = chrome.storage.local;

// Storage schema
// {
//     version: 2,
//     active: '<address>',
//     wallets: {
//         '<address>': {
//             name: '<name>',
//             key: '<privateKey>'
//         }
//     },
//     analysedHeight: 0,
//     history: {
//         '<address>': [
//             {
//                 timestamp: <timestamp>,
//                 height: <height>,
//                 type: 'blockmined|received|sent|historygap|created',
//                 address: <sender_or_receiver_address, null otherwise>,
//                 value: <value>
//             }
//         ]
//     }
// };
async function updateStoreSchema() {
    var version = await new Promise(function(resolve, reject) {
        store.get('version', function(items) {
            resolve(items.version);
        });
    });

    console.log('Storage version:', version);

    switch(version) {
        case undefined:
            var schema = {
                version: 2,
                active: null,
                wallets: {},
                analysedHeight: 0,
                history: {}
            };

            await new Promise(function(resolve, reject) {
                store.set(schema, function() {
                    if(chrome.runtime.lastError) console.error(runtime.lastError);
                    else {
                        console.log("Schema stored");
                        resolve();
                    }
                });
            });
            break;
        case 1: {
            // Update to version 2
            console.log('Updating storage to version 2');
            var wallets = Object.keys(await new Promise(function(resolve, reject) {
                store.get('wallets', function(items) {
                    resolve(items.wallets);
                });
            }));

            var history = {};
            wallets.map(function(address) {
                history[address] = [];
            });

            await new Promise(function(resolve, reject) {
                store.set({version: 2, analysedHeight: 0, history: history}, function() {
                    if(chrome.runtime.lastError) console.error(runtime.lastError);
                    else resolve();
                });
            });
            // No break at the end to fall through to following updates
        }
    }
}

async function analyseBlock(block, address, triggeredManually) {
    // For performance reasons, only check the stored analysedHeight when analyseBlock is triggered manually
    if(triggeredManually) {
        var analysedHeight = await new Promise(function(resolve, reject) {
            store.get('analysedHeight', function(items) {
                resolve(items.analysedHeight);
            });
        });

        if(analysedHeight >= block.height) return;
    }

    if(state.analysingHistory.length && !address) {
        // Postpone general analysis of new blocks until specific wallet history analysis is finished
        state.postponedBlocks.push(block);
        console.log('Postponing analysis of block', block.height);
        return;
    }

    console.log('Analysing block', block.height);

    var history = await new Promise(function(resolve, reject) {
        store.get('history', function(items) {
            resolve(items.history);
        });
    });

    var addresses = address ? [address] : Object.keys(history);

    var eventFound = false;

    // Check transactions
    if(block.transactionCount > 0) {
        for(var i = 0; i < block.transactions.length; i++) { // Cannot use .forEach here, as it is not possible to wait for anonymous functions
            var tx       = block.transactions[i],
                sender   = (await tx.getSenderAddr()).toHex(),
                receiver = tx.recipientAddr.toHex();

            if(addresses.includes(receiver)) {
                let event = {
                    timestamp: block.timestamp,
                    height: block.height,
                    type: 'received',
                    address: sender,
                    value: Nimiq.Policy.satoshisToCoins(tx.value)
                };

                console.log('Found event for', receiver, event);
                eventFound = true;

                history[receiver].unshift(event);
            }

            if(addresses.includes(sender)) {
                let event = {
                    timestamp: block.timestamp,
                    height: block.height,
                    type: 'sent',
                    address: receiver,
                    value: Nimiq.Policy.satoshisToCoins(tx.value)
                };

                console.log('Found event for', sender, event);
                eventFound = true;

                history[sender].unshift(event);
            }
        }
    }

    // Check minerAddr
    if(addresses.includes(block.minerAddr.toHex())) {
        let event = {
            timestamp: block.timestamp,
            height: block.height,
            type: 'blockmined',
            value: Nimiq.Policy.satoshisToCoins(Nimiq.Policy.BLOCK_REWARD)
        };

        console.log('Found event for', block.minerAddr.toHex(), event);
        eventFound = true;

        history[block.minerAddr.toHex()].unshift(event);
    }

    var storeUpdate = {};

    if(!address) storeUpdate.analysedHeight = block.height;

    if(eventFound) {
        storeUpdate.history = history;
        setUnreadEventsCount('!');
    }

    if(Object.keys(storeUpdate).length > 0) {
        await new Promise(function(resolve, reject) {
            store.set(storeUpdate, function() {
                if(chrome.runtime.lastError) console.error(runtime.lastError);
                else resolve();
            });
        });
    }
}

async function analyseHistory(expectedFromHeight, toHeight, address) {
    if(expectedFromHeight > toHeight) return;

    console.log('Analysing history from', expectedFromHeight, 'to', toHeight);

    // Make sure that expectedFromHeight is available in our path, otherwise start at lowest available height
    var fromHeight = Math.max(expectedFromHeight, $.blockchain.height - ($.blockchain.path.length - 1));

    if(expectedFromHeight < fromHeight) {
        var history = await new Promise(function(resolve, reject) {
            store.get('history', function(items) {
                resolve(items.history);
            });
        });

        var addresses = address ? [address] : Object.keys(history);

        var block = await $.blockchain.getBlock($.blockchain.path[0]);

        let event = {
            timestamp: block.timestamp,
            height: block.height,
            type: 'historygap'
        };

        addresses.forEach(function(address) {
            console.log('Found event for', address, event);
            history[address].unshift(event);
        });

        await new Promise(function(resolve, reject) {
            store.set({history: history}, function() {
                if(chrome.runtime.lastError) console.error(runtime.lastError);
                else resolve();
            });
        });

        // setUnreadEventsCount('!');
    }

    // Translate heights into path indices
    var index   = ($.blockchain.path.length - 1) - ($.blockchain.height - fromHeight),
        toIndex = ($.blockchain.path.length - 1) - ($.blockchain.height - toHeight);

    while(index <= toIndex) {
        await analyseBlock(await $.blockchain.getBlock($.blockchain.path[index]), address);
        index++;
    }

    if(address && state.analysingHistory.includes(address)) {
        state.analysingHistory.splice(state.analysingHistory.indexOf(address), 1);
        chrome.runtime.sendMessage({'doneAnalysing': address});
    }

    // Process any block analysis that was postponed during the run
    if(!state.analysingHistory.length)
        while(block = state.postponedBlocks.shift()) await analyseBlock(block);
}

async function getHistory(address, page) {
    page = page || 1;

    var untilIndex = 10 * (page - 1) + 10;

    var history = await new Promise(function(resolve, reject) {
        store.get('history', function(items) {
            resolve(items.history[address]);
        });
    });

    var result = history.slice(0, untilIndex);

    if(history.length > untilIndex) result.push({type: 'loadmore', nextPage: page + 1});

    return result;
}

function popupIsOpen() {
    return !!chrome.extension.getViews({ type: "popup" }).length;
}

chrome.browserAction.setBadgeBackgroundColor({color: 'firebrick'});
function setUnreadEventsCount(count) {
    count = count || '';

    if(!popupIsOpen() || state.status !== 'Consensus established' || count === '') chrome.browserAction.setBadgeText({text: count.toString()});
}

async function _start() {
    if(Nimiq._core) {
        console.error('Nimiq is already running. _stop() first.');
        return false;
    }

    await updateStoreSchema();

    store.get('active', function(items) {
        var active = items.active;

        if(active) {
            console.log('Loading active wallet', active);
            store.get('wallets', function(items) {
                var wallets = items.wallets;
                updateState({numberOfWallets: Object.keys(wallets).length});
                var privKey = wallets[active].key;
                startNimiq({walletSeed: privKey});
            });
        }
        else {
            // Start basic Nimiq runtime to be able to access Nimiq subclasses
            console.log('Loading minimal Nimiq instance');
            Nimiq.init($ => { window.$ = $; }, error => { console.error(error); });
        }
    });
}
_start();

function _stop() {
    $.miner.stopWork();
    $.network.disconnect();
    Nimiq._core = null;
    $ = null;
}

async function importPrivateKey(privKey) {
    // TODO Validate privKey format

    var address = await Nimiq.KeyPair.unserialize(Nimiq.BufferUtils.fromHex(privKey)).publicKey.toAddress();
        address = address.toHex(),
        name    = address.substring(0, 6);

    try {
        await new Promise(function(resolve, reject) {
            store.get(['wallets', 'history'], function(items) {
                var wallets = items.wallets;
                var history = items.history;

                if(wallets[address]) {
                    reject(new Error('Wallet already exists'));
                    return;
                }

                wallets[address] = {
                    name: name,
                    key: privKey
                };

                history[address] = [];

                store.set({wallets: wallets, history: history}, function() {
                    if(chrome.runtime.lastError) console.error(runtime.lastError);
                    else {
                        console.log("Stored", address);
                        updateState({numberOfWallets: Object.keys(wallets).length});
                        resolve();
                    }
                });
            });
        });
    }
    catch(e) {
        console.error(e);
        return address;
    }

    if(state.activeWallet.address) { // Only analyse history if this is not the first imported wallet
        var balance = await $.accounts.getBalance(Nimiq.Address.fromHex(address));

        if(balance.value > 0 || balance.nonce > 0) {
            state.analysingHistory.push(address);
            analyseHistory(0, $.blockchain.height, address);
        }
        else console.log('Imported wallet has balance=0 and nonce=0. Not analysing history');
    }

    return address;
}

async function listWallets() {
    var wallets = await new Promise(function(resolve, reject) {
        store.get('wallets', function(items) {
            resolve(items.wallets);
        });
    });

    if(state.status === 'Consensus established') {
        for(let address in wallets) {
            let balance = await $.accounts.getBalance(Nimiq.Address.fromHex(address));
            wallets[address].balance = Nimiq.Policy.satoshisToCoins(balance.value);
        }
    }
    else {
        for(let address in wallets) {
            wallets[address].balance = 'loading...';
        }
    }

    state.analysingHistory.forEach(address => wallets[address].analysingHistory = true);

    return wallets;
}

function switchWallet(address) {
    if(state.analysingHistory.includes(address)) return false;

    store.set({active: address}, function() {
        if(chrome.runtime.lastError) console.error(runtime.lastError);
        else {
            console.log("Activated", address);
            store.get('wallets', function(items) {
                var wallets = items.wallets;

                updateState({activeWallet: {
                    name: wallets[address].name,
                    address: address,
                    balance: 'loading...'
                }});

                _stop();
                _start();
            });
        }
    });
}

async function updateName(address, name) {
    return new Promise(function(resolve, reject) {
        store.get('wallets', function(items) {
            var wallets = items.wallets;
            wallets[address].name = name;

            store.set({wallets: wallets}, function() {
                if(chrome.runtime.lastError) console.error(runtime.lastError);
                else {
                    console.log("Stored name", name, address);
                    if(address === state.activeWallet.address) {
                        updateState({activeWallet: {
                            name: name,
                            address: state.activeWallet.address,
                            balance: state.activeWallet.balance
                        }});
                    }
                    resolve();
                }
            });
        });
    });
}

async function createNewWallet() {
    var wallet = await Nimiq.Wallet.createVolatile();
    return await importPrivateKey(wallet.dump());
}

async function removeWallet(address) {
    return new Promise(function(resolve, reject) {
        store.get(['wallets', 'history'], function(items) {
            var wallets = items.wallets;
            var history = items.history;

            delete wallets[address];
            delete history[address];

            store.set({wallets: wallets, history: history}, function() {
                if(chrome.runtime.lastError) console.error(runtime.lastError);
                else {
                    console.log("Removed wallet", address);
                    updateState({numberOfWallets: Object.keys(wallets).length});
                    resolve();
                }
            });
        });
    });
}

async function sendTransaction(address, value) {
    if (!address) {
        return "No address";
    }

    try {
        address = new Nimiq.Address(Nimiq.BufferUtils.fromHex(address));
    } catch (e) {
        return "No valid address";
    }

    if (isNaN(value) || value <= 0) {
        return "No valid value";
    }

    var balance = await $.accounts.getBalance($.wallet.address);

    value = Nimiq.Policy.coinsToSatoshis(value);

    var fee = 0;

    if (balance.value < value + fee) {
        return "Not enough funds";
    }

    var tx = await $.wallet.createTransaction(address, value, fee, balance.nonce);

    $.mempool.pushTransaction(tx);

    console.log("Pushed transaction", tx);
}
