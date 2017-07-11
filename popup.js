// Cache all document node pointers
var $address      = document.getElementById('address'),
    $balance      = document.getElementById('balance'),
    $status       = document.getElementById('status'),
    $height       = document.getElementById('height'),
    $targetHeight = document.getElementById('targetHeight'),
    $peers        = document.getElementById('peers'),
    $mining       = document.getElementById('mining'),
    $hashrate     = document.getElementById('hashrate'),
    $walletList   = document.getElementById('wallet-list');

// Cache all input elements
var $buttonStartMining   = document.getElementById('button-start-mining'),
    $buttonStopMining    = document.getElementById('button-stop-mining'),
    $inputPrivKey        = document.getElementById('input-privKey'),
    $buttonImportPrivKey = document.getElementById('button-import-privKey'),
    $buttonImportBetanet = document.getElementById('button-import-betanet');

// Set up initial values
var bgPage = chrome.extension.getBackgroundPage(),
    state  = bgPage.state;

$address.innerText      = state.address;
$balance.innerText      = state.balance;
$status.innerText       = state.status;
$height.innerText       = state.height;
$targetHeight.innerText = state.targetHeight;
$peers.innerText        = state.peers;
$mining.innerText       = state.mining;
$hashrate.innerText     = state.hashrate;

async function updateWalletList() {
    var wallets = await bgPage.listWallets();

    var html = '<ul>';

    console.log(wallets);

    for(let address in wallets) {
        let addressHMTL = address;
        if(address === state.address) addressHMTL = '<strong>' + address + '</strong>';

        html += '<li>';
        html += 'Name: ' + wallets[address].name + ' <button data-wallet="' + address + '">Use</button><br>';
        html += '<hash>' + addressHMTL + '</hash><br>';
        html += 'Balance: ' + wallets[address].balance;
        html += '</li>';
    }

    html += '</ul>';

    $walletList.innerHTML = html;
}
updateWalletList();

// Listen for updates from the background script
function messageReceived(update) {
    console.log("message received:", update);

    var key = Object.keys(update)[0];

    if(key === 'privKey') {
        importPrivateKey(update.privKey);
    }
    else {
        if(key === 'balance') {
            // Skip balance updates during wallet switch
            if(state.balance === 'loading...' && state.status !== 'Consensus established')
                return;
        }

        Object.assign(state, update);

        switch(key) {
            case 'address':      $address.innerText      = state.address; updateWalletList(); break;
            case 'balance':      $balance.innerText      = state.balance;      break;
            case 'status':       $status.innerText       = state.status;  updateWalletList(); break;
            case 'height':       $height.innerText       = state.height;       break;
            case 'targetHeight': $targetHeight.innerText = state.targetHeight; break;
            case 'peers':        $peers.innerText        = state.peers;        break;
            case 'mining':       $mining.innerText       = state.mining;       break;
            case 'hashrate':     $hashrate.innerText     = state.hashrate;     break;
        }
    }
}
chrome.runtime.onMessage.addListener(messageReceived);

async function importPrivateKey(key) {
    await bgPage.importPrivateKey(key);
    updateWalletList();
}

async function updateName(address, name) {
    await bgPage.updateName(address, name);
    updateWalletList();
}

// Attach input listeners
$buttonStartMining.addEventListener('click', bgPage.startMining);
$buttonStopMining.addEventListener('click', bgPage.stopMining);
$buttonImportPrivKey.addEventListener('click', async e => {
    importPrivateKey($inputPrivKey.value);
});
$walletList.addEventListener('click', e => {
    if(e.target.matches('button')) {
        bgPage.switchWallet(e.target.getAttribute('data-wallet'));
    }
});
$buttonImportBetanet.addEventListener('click', e => {
    chrome.tabs.query({active: true}, tabs => {
        var tab = tabs[0];
        if(tab.url === 'https://nimiq.com/betanet/') {
            chrome.tabs.executeScript({file: "extract_betanet_key.js"});
        }
        else {
            window.open('https://nimiq.com/betanet','_newtab');
        }
    });
});
