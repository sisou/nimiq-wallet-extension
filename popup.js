// Cache all document node pointers
var $address      = document.getElementById('address'),
    $balance      = document.getElementById('balance'),
    $status       = document.getElementById('status'),
    $height       = document.getElementById('height'),
    $targetHeight = document.getElementById('targetHeight'),
    $peers        = document.getElementById('peers'),
    $mining       = document.getElementById('mining'),
    $hashrate     = document.getElementById('hashrate');

// Set up initial values
state = chrome.extension.getBackgroundPage().state;

$address.innerText      = state.address;
$balance.innerText      = state.balance;
$status.innerText       = state.status;
$height.innerText       = state.height;
$targetHeight.innerText = state.targetHeight;
$peers.innerText        = state.peers;
$mining.innerText       = state.mining;
$hashrate.innerText     = state.hashrate;

// Listen for updates from the background script
function messageReceived(update) {
    console.log("message received:", update);
    Object.assign(state, update);

    switch(Object.keys(update)[0]) {
        case 'address':      $address.innerText      = state.address;      break;
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
