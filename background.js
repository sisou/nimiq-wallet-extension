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
    peers: 0,
    status: 'Not connected',
    mining: false,
    threads: 1,
    hashrate: 0,
    pendingTxs: [],
    analysingHistory: [], // Store all addresses that are currently being analysed
    postponedBlocks: []
};

function updateState(update) {
    Object.assign(state, update);
    chrome.runtime.sendMessage(update);
}

async function _updateBalance() {
    var account = await $.accounts.get($.wallet.address) || Nimiq.BasicAccount.INITIAL;
    _onBalanceChanged(account.balance);
}

function _onConsensusEstablished() {
    console.log('Consensus established');
    updateState({status: 'Consensus established'});

    // Get current balance and initiate listener.
    $.blockchain.on('head-changed', _updateBalance);
    _updateBalance();

    store.get('analysedHeight', function(items) {
        analyseHistory(items.analysedHeight + 1, $.blockchain.height);
    });

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
    if(typeof $ !== 'undefined' && !!$) $.miner.stopWork();
    updateState({mining: $ && $.miner && $.miner.working});
    updateState({hashrate: 0});
}

function setMiningThreads(threads) {
    threads = Math.min(threads, navigator.hardwareConcurrency);
    $.miner.threads = threads;
    updateState({threads: $.miner.threads});
}

function _onBalanceChanged(newBalance) {
    console.log(`Balance is ${Nimiq.Policy.satoshisToCoins(newBalance)}.`);
    updateState({activeWallet: {
        name: state.activeWallet.name,
        address: state.activeWallet.address,
        balance: Nimiq.Policy.satoshisToCoins(newBalance)
    }});
}

async function _onHeadChanged(block, triggeredManually) {
    console.log(`Now at height #${block.height}.`);
    await analyseBlock(block, null, triggeredManually);
    updateState({height: block.height});
}

function _onPeersChanged() {
    console.log(`Connected to ${$.network.peerCount} peers (WebSocket: ${$.network.peerCountWebSocket}, WebRTC: ${$.network.peerCountWebRtc})`);
    updateState({peers: $.network.peerCount});
}

async function _mempoolChanged() {
    var txs = $.mempool.getTransactions();

    var pendingTxs = [];

    for (var tx of txs) {
        var sender   = tx.sender.toUserFriendlyAddress(),
            receiver = tx.recipient.toUserFriendlyAddress();

        if([sender, receiver].includes(state.activeWallet.address)) {
            pendingTxs.push({
                address : sender === state.activeWallet.address ? receiver : sender,
                value: Nimiq.Policy.satoshisToCoins(tx.value),
                type: sender === state.activeWallet.address ? 'sending' : 'receiving',
                // message: null, // TODO Fill when available
                fee: Nimiq.Policy.satoshisToCoins(tx.fee),
                // nonce: tx.nonce
            });
        }
    }

    updateState({pendingTxs: pendingTxs});
}

function startNimiq() {
    updateState({status: 'Connecting'});

    Nimiq.init(async () => {
        console.log('Nimiq loaded. Connecting and establishing consensus.');

        $ = {};
        window.$ = $;
        $.consensus = await Nimiq.Consensus.light();

        $.blockchain = $.consensus.blockchain;
        $.accounts = $.blockchain.accounts;
        $.mempool = $.consensus.mempool;
        $.network = $.consensus.network;
        $.wallet = await Nimiq.Wallet.getPersistent();
        $.miner = new Nimiq.Miner($.blockchain, $.mempool, $.wallet.address);
        updateState({threads: $.miner.threads});

        console.log('Your address: ' + $.wallet.address.toUserFriendlyAddress());

        store.get('wallets', function(items) {
            var wallets = items.wallets;

            updateState({activeWallet: {
                name: wallets[$.wallet.address.toUserFriendlyAddress()].name,
                address: $.wallet.address.toUserFriendlyAddress(),
                balance: state.activeWallet.balance
            }});
        });

        $.consensus.on('syncing', () => { updateState({status: 'Synchronizing'}); });
        $.consensus.on('sync-chain-proof', () => { updateState({status: 'Downloading chain'}); });
        $.consensus.on('verify-chain-proof', () => { updateState({status: 'Verifying chain'}); });
        $.consensus.on('sync-accounts-tree', () => { updateState({status: 'Downloading accounts'}); });
        $.consensus.on('verify-accounts-tree', () => { updateState({status: 'Verifying accounts'}); });
        $.consensus.on('sync-finalize', () => { updateState({status: 'Storing data'}); });
        $.consensus.on('established', () => _onConsensusEstablished());
        $.consensus.on('lost', () => _onConsensusLost());

        $.blockchain.on('head-changed', (block) => _onHeadChanged(block));
        _onHeadChanged($.blockchain.head, true);

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
    });
}

function messageReceived(msg) {
    console.log("message received:", msg);
}
chrome.runtime.onMessage.addListener(messageReceived);

var store = chrome.storage.local;

// Storage schema
// {
//     version: 3,
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
                version: 3,
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
        case 1:
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
        case 2:
            // Update to version 3
            // Delete everything, because Luna is not backwards-compatible
            await new Promise(function(resolve, reject) {
                store.clear(function() {
                    if(chrome.runtime.lastError) console.error(runtime.lastError);
                    else resolve();
                });
            });

            // Initialize new schema
            await updateStoreSchema();
            // No break at the end to fall through to following updates
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

    if(!$.consensus.established || (state.analysingHistory.length && !address)) {
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
                sender   = tx.sender.toUserFriendlyAddress(),
                receiver = tx.recipient.toUserFriendlyAddress();

            if(addresses.includes(receiver)) {
                let event = {
                    timestamp: block.timestamp,
                    height: block.height,
                    type: 'received',
                    address: sender,
                    value: Nimiq.Policy.satoshisToCoins(tx.value),
                    fee: Nimiq.Policy.satoshisToCoins(tx.fee)
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
                    value: Nimiq.Policy.satoshisToCoins(tx.value),
                    fee: Nimiq.Policy.satoshisToCoins(tx.fee)
                };

                console.log('Found event for', sender, event);
                eventFound = true;

                history[sender].unshift(event);
            }
        }
    }

    // Check minerAddr
    if(addresses.includes(block.minerAddr.toUserFriendlyAddress())) {
        let fees = block.transactions.reduce((acc, tx) => acc + tx.fee, 0);

        let event = {
            timestamp: block.timestamp,
            height: block.height,
            type: 'blockmined',
            value: Nimiq.Policy.satoshisToCoins(Nimiq.Policy.blockRewardAt(block.height) + fees)
        };

        console.log('Found event for', block.minerAddr.toUserFriendlyAddress(), event);
        eventFound = true;

        history[block.minerAddr.toUserFriendlyAddress()].unshift(event);
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

    // Make sure that expectedFromHeight is available in our path, otherwise start at lowest available height
    // FIXME: While NUM_BLOCKS_VALIDATION must always be present, it's possible that even more blocks are available. Find a way to find that oldest full block
    var fromHeight = Math.max(expectedFromHeight, $.blockchain.height - Nimiq.Policy.NUM_BLOCKS_VERIFICATION);

    console.log('Analysing history from', expectedFromHeight, 'to', toHeight, 'starting at', fromHeight);

    if(expectedFromHeight < fromHeight) {
        var history = await new Promise(function(resolve, reject) {
            store.get('history', function(items) {
                resolve(items.history);
            });
        });

        var addresses = address ? [address] : Object.keys(history);

        var block = await $.blockchain.getBlockAt(fromHeight);

        let event = {
            timestamp: block.timestamp,
            height: block.height,
            type: 'historygap'
        };

        for(address of addresses) {
            var account = await $.accounts.get(Nimiq.Address.fromUserFriendlyAddress(address)) || Nimiq.BasicAccount.INITIAL;
            if(account.balance > 0 || account.nonce > 0) {
                console.log('Found event for', address, event);
                history[address].unshift(event);
            }
        }

        await new Promise(function(resolve, reject) {
            store.set({history: history}, function() {
                if(chrome.runtime.lastError) console.error(runtime.lastError);
                else resolve();
            });
        });

        // setUnreadEventsCount('!');
    }

    while(fromHeight <= toHeight) {
        await analyseBlock(await $.blockchain.getBlockAt(fromHeight), address);
        fromHeight++;
    }

    if(address && state.analysingHistory.includes(address)) {
        state.analysingHistory.splice(state.analysingHistory.indexOf(address), 1);
        chrome.runtime.sendMessage({'doneAnalysing': address});
    }

    // Process any block analysis that was postponed during the run
    if(!state.analysingHistory.length)
        while(block = state.postponedBlocks.shift()) await analyseBlock(block, null, true);
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
    if(typeof $ !== 'undefined' && !!$) {
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
                startNimiq();
            });
        }
        else {
            // Start basic Nimiq runtime to be able to access Nimiq subclasses
            console.log('Loading minimal Nimiq instance');
            Nimiq.init(null, error => { console.error(error); });
        }
    });
}
_start();

function _stop() {
    if(typeof $ !== 'undefined' && !!$) {
        stopMining();
        $.network.disconnect();
    }
    $ = null;
}

async function importPrivateKey(privKey) {
    // TODO Validate privKey format

    var address = await Nimiq.KeyPair.fromHex(privKey).publicKey.toAddress();
        address = address.toUserFriendlyAddress(),
        name    = address.substr(5, 9);

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
        var account = await $.accounts.get(Nimiq.Address.fromUserFriendlyAddress(address)) || Nimiq.BasicAccount.INITIAL;

        if(account.balance > 0 || account.nonce > 0) {
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
            let account = await $.accounts.get(Nimiq.Address.fromUserFriendlyAddress(address)) || Nimiq.BasicAccount.INITIAL;
            wallets[address].balance = Nimiq.Policy.satoshisToCoins(account.balance);
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

                // Write new active privKey in Nimiq's database
                (new Nimiq.WalletStore()).then(walletStore => {
                    var keys = Nimiq.KeyPair.fromHex(wallets[address].key);
                    walletStore.put('keys', keys).then(_start);
                });
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
        address = Nimiq.Address.fromUserFriendlyAddress(address);
    } catch (e) {
        return "Not a valid address";
    }

    if (isNaN(value) || value <= 0) {
        return "Not a valid value";
    }

    var account = await $.accounts.get($.wallet.address) || Nimiq.BasicAccount.INITIAL;

    value = Nimiq.Policy.coinsToSatoshis(value);

    var fee = 0;

    if (account.balance < value + fee) {
        return "Not enough funds";
    }

    var tx = await $.wallet.createTransaction(address, value, fee, account.nonce);

    $.mempool.pushTransaction(tx);

    console.log("Pushed transaction", tx);
}
