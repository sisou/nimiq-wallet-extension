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
    balance: 0,
    address: '',
    status: 'Connecting',
    mining: false,
    hashrate: 0
};

function _onConsensusEstablished() {
    console.log('Consensus established');
    state.status = 'Consensus established';
    state.targetHeight = 0;

    // Get current balance and initiate listener.
    $.accounts.getBalance($.wallet.address).then(balance => _onBalanceChanged(balance));
    $.accounts.on($.wallet.address, account => _onBalanceChanged(account.balance));

    console.log('Your address: ' + $.wallet.address.toHex());
    state.address = $.wallet.address.toHex();

    // If we want to start mining.
    // $.miner.startWork();
}

function _onConsensusLost() {
    console.log('Consensus lost');
    state.status = 'Consensus lost';
    stopMining();
}

function startMining() {
    if($.consensus.established) {
        $.miner.startWork();
        state.mining = $.miner.working;
    }
}

function stopMining() {
    $.miner.stopWork();
    state.mining = $.miner.working;
}

function _onBalanceChanged(newBalance) {
    console.log(`Balance is ${Nimiq.Policy.satoshisToCoins(newBalance.value)}.`);
    state.balance = Nimiq.Policy.satoshisToCoins(newBalance.value);
}

function _onHeadChanged() {
    console.log(`Now at height #${$.blockchain.height}.`);
    state.height = $.blockchain.height;
}

function _onPeersChanged() {
    console.log(`Connected to ${$.network.peerCount} peers (WebSocket: ${$.network.peerCountWebSocket}, WebRTC: ${$.network.peerCountWebRtc})`);
    state.peers = $.network.peerCount
}

Nimiq.init($ => {
    console.log('Nimiq loaded. Connecting and establishing consensus.');

    window.$ = $;

    $.consensus.on('sync', (targetHeight) => { state.status = 'Syncing'; state.targetHeight = targetHeight; });
    $.consensus.on('established', () => _onConsensusEstablished());
    $.consensus.on('lost', () => _onConsensusLost());

    $.blockchain.on('head-changed', () => _onHeadChanged());

    $.miner.on('hashrate-changed', () => { state.hashrate = $.miner.hashrate; });

    $.network.on('peers-changed', () => _onPeersChanged());

    $.network.connect();
}, function(error) {
    console.error(error);
});
