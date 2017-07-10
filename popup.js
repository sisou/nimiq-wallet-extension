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
var $buttonStart         = document.getElementById('button-start'),
    $buttonStop          = document.getElementById('button-stop'),
    $buttonStartMining   = document.getElementById('button-start-mining'),
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

    for(let wallet of wallets) {
        let walletHTML = wallet;
        if(wallet === state.address) walletHTML = '<strong>' + wallet + '</strong>';
        html += '<li>' + walletHTML + ' <button data-wallet="' + wallet + '">Use</button></li>';
    }

    html += '</ul>';

    $walletList.innerHTML = html;
}
updateWalletList();

// Listen for updates from the background script
function messageReceived(update) {
    console.log("message received:", update);
    Object.assign(state, update);

    switch(Object.keys(update)[0]) {
        case 'address':      $address.innerText      = state.address; updateWalletList(); break;
        case 'balance':      $balance.innerText      = state.balance;      break;
        case 'status':       $status.innerText       = state.status;       break;
        case 'height':       $height.innerText       = state.height;       break;
        case 'targetHeight': $targetHeight.innerText = state.targetHeight; break;
        case 'peers':        $peers.innerText        = state.peers;        break;
        case 'mining':       $mining.innerText       = state.mining;       break;
        case 'hashrate':     $hashrate.innerText     = state.hashrate;     break;
    }
}
chrome.runtime.onMessage.addListener(messageReceived);

// Attach input listeners
$buttonStart.addEventListener('click', bgPage.start);
$buttonStop.addEventListener('click', bgPage.stop);
$buttonStartMining.addEventListener('click', bgPage.startMining);
$buttonStopMining.addEventListener('click', bgPage.stopMining);
$buttonImportPrivKey.addEventListener('click', async e => {
    await bgPage.importPrivateKey($inputPrivKey.value);
    updateWalletList();
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
            console.log("run $.wallet.dump() in the page context");
            chrome.tabs.executeScript({code:"$.wallet.dump()"});
        }
        else {
            console.log("Navigate to https://nimiq.com/betanet and try again.");
        }
    });
});
