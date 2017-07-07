var $address      = document.getElementById('address'),
    $balance      = document.getElementById('balance'),
    $status       = document.getElementById('status'),
    $height       = document.getElementById('height'),
    $targetHeight = document.getElementById('targetHeight'),
    $peers        = document.getElementById('peers'),
    $mining       = document.getElementById('mining'),
    $hashrate     = document.getElementById('hashrate');

state = chrome.extension.getBackgroundPage().state;

$address.innerText      = state.address;
$balance.innerText      = state.balance;
$status.innerText       = state.status;
$height.innerText       = state.height;
$targetHeight.innerText = state.targetHeight;
$peers.innerText        = state.peers;
$mining.innerText       = state.mining;
$hashrate.innerText     = state.hashrate;
