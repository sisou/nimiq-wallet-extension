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
    outgoingTx: [],
    incomingTx: []
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

async function _onHeadChanged() {
    console.log(`Now at height #${$.blockchain.height}.`);
    await analyseBlock($.blockchain.head);
    updateState({height: $.blockchain.height});
}

function _onPeersChanged() {
    console.log(`Connected to ${$.network.peerCount} peers (WebSocket: ${$.network.peerCountWebSocket}, WebRTC: ${$.network.peerCountWebRtc})`);
    updateState({peers: $.network.peerCount});
}

async function _mempoolChanged() {
    var txs = $.mempool.getTransactions();

    var outgoing = [],
        incoming = [];

    for (var tx of txs) {
        var senderAddr = await tx.getSenderAddr();

        var value = Nimiq.Policy.satoshisToCoins(tx.value);
        var fee = Nimiq.Policy.satoshisToCoins(tx.fee);

        var txObj = {
            sender: senderAddr.toHex(),
            receiver: tx.recipientAddr.toHex(),
            value: value,
            message: null, // TODO Fill when available
            fee: fee,
            nonce: tx.nonce
        };

        if(txObj.sender === state.activeWallet.address)
            outgoing.push(txObj);
        if(txObj.receiver === state.activeWallet.address)
            incoming.push(txObj);
    }

    updateState({outgoingTx: outgoing});
    updateState({incomingTx: incoming});
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

        $.blockchain.on('head-changed', () => _onHeadChanged());
        _onHeadChanged();

        $.miner.on('hashrate-changed', () => {
            updateState({hashrate: $.miner.hashrate});
        });

        $.network.on('peers-changed', () => _onPeersChanged());

        $.mempool.on('*', () => _mempoolChanged());
        _mempoolChanged();

        await analyseHistory(store.analysedHeight + 1, $.blockchain.height);

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
//                 type: 'blockmined|incoming|outgoing|historygap|created',
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

async function analyseBlock(block) {
    console.log('Analysing block', block.height);

    var history = await new Promise(function(resolve, reject) {
        store.get('history', function(items) {
            resolve(items.history);
        });
    });

    var addresses = Object.keys(history);

    // Check transactions
    if(block.transactionCount > 0) {
        block.transactions.forEach(async function(tx) {
            if(addresses.indexOf(tx.recipientAddr.toHex()) > -1) {
                let event = {
                    timestamp: block.timestamp,
                    height: block.height,
                    type: 'incoming',
                    address: (await tx.getSenderAddr()).toHex(),
                    value: tx.value
                };

                console.log('Found event:', event);

                history[tx.recipientAddr.toHex()].unshift(event);
            }
            else if(addresses.indexOf((await tx.getSenderAddr()).toHex()) > -1) {
                let event = {
                    timestamp: block.timestamp,
                    height: block.height,
                    type: 'outgoing',
                    address: tx.recipientAddr.toHex(),
                    value: tx.value
                };

                console.log('Found event:', event);

                history[(await tx.getSenderAddr()).toHex()].unshift(event);
            }
        });
    }

    // Check minerAddr
    if(addresses.indexOf(block.minerAddr.toHex()) > -1) {
        let event = {
            timestamp: block.timestamp,
            height: block.height,
            type: 'blockmined',
            value: Nimiq.Policy.BLOCK_REWARD
        };

        console.log('Found event:', event);

        history[block.minerAddr.toHex()].unshift(event);
    }

    await new Promise(function(resolve, reject) {
        store.set({history: history, analysedHeight: block.height}, function() {
            if(chrome.runtime.lastError) console.error(runtime.lastError);
            else resolve();
        });
    });
}

async function analyseHistory(expectedFromHeight, toHeight) {
    if(expectedFromHeight > toHeight) return;

    // Make sure that expectedFromHeight is available in our path, otherwise start at lowest available height
    var fromHeight = Math.max(expectedFromHeight, $.blockchain.height - ($.blockchain.path.length - 1));

    if(expectedFromHeight < fromHeight) {
        var history = await new Promise(function(resolve, reject) {
            store.get('history', function(items) {
                resolve(items.history);
            });
        });

        var addresses = Object.keys(history);

        let event = {
            timestamp: $.blockchain.head.timestamp,
            height: $.blockchain.height,
            type: 'historygap'
        };

        console.log('Found event:', event);

        addresses.forEach(function(address) {
            history[address].unshift(event);
        });

        await new Promise(function(resolve, reject) {
            store.set({history: history}, function() {
                if(chrome.runtime.lastError) console.error(runtime.lastError);
                else resolve();
            });
        });
    }

    // Translate fromHeight into path index
    var index = ($.blockchain.path.length - 1) - ($.blockchain.height - fromHeight);

    while(index < $.blockchain.length) {
        await analyseBlock(await $.blockchain.getBlock($.blockchain.path[index]));
    }
}

async function _start() {
    if(Nimiq._core) {
        console.error('Nimiq is already running. _stop() first.');
        return false;
    }

    await updateStoreSchema();

    store.get('active', function(items) {
        console.log(items);
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

async function importPrivateKey(privKey, name) {
    // TODO Validate privKey format

    var address = await Nimiq.KeyPair.unserialize(Nimiq.BufferUtils.fromHex(privKey)).publicKey.toAddress();
        address = address.toHex();

    if(!name) name = address.substring(0, 6);

    return new Promise(function(resolve, reject) {
        store.get(['wallets', 'history'], function(items) {
            console.log(items);

            var wallets = items.wallets;
            var history = items.history;

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
                    resolve(address);
                }
            });
        });
    });
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

    return wallets;
}

function switchWallet(address) {
    store.set({active: address}, function() {
        if(chrome.runtime.lastError) console.error(runtime.lastError);
        else {
            console.log("Activated", address);
            store.get('wallets', function(items) {
                console.log(items);

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
            console.log(items);

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
            console.log(items);

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
