/* jshint esversion: 6 */

var $sandbox = document.getElementById('sandbox');

// Overwrite test functions that use eval to route the tests into the sandbox
Nimiq._hasNativeClassSupport = async function() {
    var message = {
        command: '_hasNativeClassSupport'
    };
    $sandbox.contentWindow.postMessage(message, '*');

    return await new Promise(function(resolve, reject){
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

    return await new Promise(function(resolve, reject){
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

    return await new Promise(function(resolve, reject){
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
    height: 0,
    targetHeight: 0,
    peers: 0,
    balance: 'loading...',
    address: '',
    status: 'Not connected',
    mining: false,
    hashrate: 0
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

function start(params) {
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

store.get('active', function(items) {
    console.log(items);
    var active = items.active;
    if(active) {
        store.get('wallets', function(items) {
            console.log(items);
            var wallets = items.wallets;
            var privKey = wallets[active];
            console.log("store.wallets." + active, privKey);
            start({walletseed: privKey});
        });
    }
});

// Storage schema
// {
//     active: '<address>',
//     wallets: {
//         '<address>': '<privateKey>',
//         '<address>': '<privateKey>'
//     }
// };
function writeStoreSchema() {
    // TODO Save-guard against overwriting existing data

    var schema = {
        active: null,
        wallets: {}
    };

    store.set(schema, function() {
        if(chrome.runtime.lastError) console.log(runtime.lastError);
        else console.log("Schema stored");
    });
}

function storeWallet(address, privKey, activate) {
    store.get('wallets', function(items) {
        console.log(items);

        var wallets = items.wallets;
        wallets[address] = privKey;

        store.set({wallets: wallets}, function() {
            if(chrome.runtime.lastError) console.log(runtime.lastError);
            else if(activate)
                store.set({active: address}, function() {
                    if(chrome.runtime.lastError) console.log(runtime.lastError);
                    else console.log("Stored and activated", address);
                });
            else console.log("Stored", address);
        });
    });
}
