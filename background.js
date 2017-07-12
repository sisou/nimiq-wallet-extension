/* jshint esversion: 6 */

var $sandbox = document.getElementById('sandbox');

// Overwrite test functions that use eval to route the tests into the sandbox
Nimiq._hasNativeClassSupport = async function() {
    var message = {
        command: '_hasNativeClassSupport'
    };
    $sandbox.contentWindow.postMessage(message, '*');

    return await new Promise(function(resolve, reject) {
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

    return await new Promise(function(resolve, reject) {
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

    return await new Promise(function(resolve, reject) {
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
    numberOfWallets: 0,
    height: 0,
    targetHeight: 0,
    peers: 0,
    balance: 'loading...',
    address: '',
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
    updateState({balance: Nimiq.Policy.satoshisToCoins(newBalance.value)});
}

function _onHeadChanged() {
    console.log(`Now at height #${$.blockchain.height}.`);
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

        if(txObj.sender === state.address)
            outgoing.push(txObj);
        if(txObj.receiver === state.address)
            incoming.push(txObj);
    }

    updateState({outgoingTx: outgoing});
    updateState({incomingTx: incoming});
}

function startNimiq(params) {
    updateState({status: 'Connecting'});

    var defaults = {};

    var options = Object.assign({}, defaults, params);

    Nimiq.init($ => {
        console.log('Nimiq loaded. Connecting and establishing consensus.');

        window.$ = $;

        console.log('Your address: ' + $.wallet.address.toHex());
        updateState({address: $.wallet.address.toHex()});

        $.consensus.on('syncing', (targetHeight) => {
            updateState({status: 'Syncing', targetHeight});
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

function _start() {
    if(Nimiq._core) {
        console.error('Nimiq is already running. _stop() first.');
        return false;
    }

    store.get('active', function(items) {
        console.log(items);
        var active = items.active;

        if(typeof active === 'undefined') {
            // Storage schema is not yet set
            writeStoreSchema();
            _start();
            return;
        }

        if(active) {
            store.get('wallets', function(items) {
                console.log(items);
                var wallets = items.wallets;
                updateState({numberOfWallets: Object.keys(wallets).length});
                var privKey = wallets[active].key;
                console.log("store.wallets." + active, privKey);
                startNimiq({walletSeed: privKey});
            });
        }
        else {
            // Start basic Nimiq runtime to be able to access Nimiq subclasses
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

// Storage schema
// {
//     version: 1,
//     active: '<address>',
//     wallets: {
//         '<address>': {
//              name: 'Wallet Nr 1',
//              key: '<privateKey>'
//         },
//         '<address>': {
//              name: 'Wallet Nr 1',
//              key: '<privateKey>'
//         }
//     }
// };
function writeStoreSchema() {
    // TODO Save-guard against overwriting existing data

    var schema = {
        version: 1,
        active: null,
        wallets: {}
    };

    store.set(schema, function() {
        if(chrome.runtime.lastError) console.log(runtime.lastError);
        else console.log("Schema stored");
    });
}

async function importPrivateKey(privKey, name) {
    // TODO Validate privKey format

    var address = await Nimiq.KeyPair.unserialize(Nimiq.BufferUtils.fromHex(privKey)).publicKey.toAddress();
        address = address.toHex();

    if(!name) name = address.substring(0, 6);

    return await new Promise(function(resolve, reject) {
        store.get('wallets', function(items) {
            console.log(items);

            var wallets = items.wallets;

            // If this is the first wallet created, activate it
            var activate = Object.keys(wallets).length === 0;

            wallets[address] = {
                name: name,
                key: privKey
            };

            store.set({wallets: wallets}, function() {
                if(chrome.runtime.lastError) console.log(runtime.lastError);
                else if(activate)
                    store.set({active: address}, function() {
                        if(chrome.runtime.lastError) console.log(runtime.lastError);
                        else {
                            console.log("Stored and activated", address);
                            switchWallet(address);
                            updateState({numberOfWallets: Object.keys(wallets).length});
                            resolve();
                        }
                    });
                else {
                    console.log("Stored", address);
                    updateState({numberOfWallets: Object.keys(wallets).length});
                    resolve();
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
        if(chrome.runtime.lastError) console.log(runtime.lastError);
        else {
            console.log("Activated", address);
            updateState({address: address});
            updateState({balance: 'loading...'});
            _stop();
            _start();
        }
    });
}

async function updateName(address, name) {
    return await new Promise(function(resolve, reject) {
        store.get('wallets', function(items) {
            console.log(items);

            var wallets = items.wallets;
            wallets[address].name = name;

            store.set({wallets: wallets}, function() {
                if(chrome.runtime.lastError) console.log(runtime.lastError);
                else {
                    console.log("Stored name", name, address);
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
    return await new Promise(function(resolve, reject) {
        store.get('wallets', function(items) {
            console.log(items);

            var wallets = items.wallets;
            delete wallets[address];

            store.set({wallets: wallets}, function() {
                if(chrome.runtime.lastError) console.log(runtime.lastError);
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
