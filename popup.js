/* jshint esversion: 6 */

// Cache all document node pointers
var $address            = document.getElementById('activeWalletAddress'),
    $name               = document.getElementById('activeWalletName'),
    $identicon          = document.getElementById('activeWalletIdenticon'),
    $balance            = document.getElementById('activeWalletBalance'),
    $newTx              = document.getElementById('new-tx'),
    $pendingHistoryList = document.getElementById('pending-history-list'),
    $historyList        = document.getElementById('history-list'),
    $statusIndicator    = document.getElementById('statusIndicator'),
    $status             = document.getElementById('status'),
    $height             = document.getElementById('height'),
    $loadingScreen      = document.getElementById('loading-screen'),
    $loadingProgress    = document.getElementById('loading-progress-bar'),
    $loadingStatus      = document.getElementById('loading-status'),
    $peers              = document.getElementById('peers'),
    $walletManagement   = document.getElementById('wallet-management'),
    $walletImport       = document.getElementById('wallet-import'),
    $walletList         = document.getElementById('wallet-list'),
    $toast              = document.getElementById('toast'),
    $version            = document.getElementById('version');

// Cache all input elements
var $buttonCopyAddress        = document.getElementById('buttonActiveWalletCopyAddress'),
    $buttonNewTx              = document.getElementById('buttonNewTx'),
    $buttonCloseNewTx         = document.getElementById('button-close-new-tx'),
    $inputTxReceiver          = document.getElementById('input-tx-receiver'),
    $inputTxValue             = document.getElementById('input-tx-value'),
    $buttonSendTx             = document.getElementById('button-send-tx'),
    $buttonToggleMining       = document.getElementById('buttonToggleMining'),
    $inputMiningThreads       = document.getElementById('inputMiningThreads'),
    $buttonShowMyWallets      = document.getElementById('buttonShowMyWallets'),
    $buttonCloseMyWallets     = document.getElementById('button-close-my-wallets'),
    $buttonShowImportWallets  = document.getElementById('button-show-import-wallets'),
    $buttonCloseImportWallets = document.getElementById('button-close-import-wallets'),
    $inputPrivKey             = document.getElementById('input-privKey'),
    $buttonImportPrivKey      = document.getElementById('button-import-privKey'),
    $buttonImportTestnet      = document.getElementById('button-import-testnet'),
    $buttonNewWallet          = document.getElementById('button-create-new-wallet');

// Helper functions
function formatBalance(value) {
    if(isNaN(value)) return value;

    // If the value has no decimal places below 0.01, display 0 decimals
    if(parseFloat(value.toFixed(2)) === value) {
        return value.toFixed(2);
    }
    // Otherwise, all required decimals will be displayed automatically
    else return value;
}

// Set up initial values
var bgPage = chrome.extension.getBackgroundPage(),
    state  = bgPage.state;

function setLoadingScreen() {
    $loadingStatus.innerText = state.status;
    var progress = 0; // %
    switch(state.status) {
        case 'Synchronizing':
        case 'Downloading chain':
            progress = 10; break;
        case 'Verifying chain':
            progress = 30; break;
        case 'Downloading accounts':
            progress = 50; break;
        case 'Verifying accounts':
            progress = 70; break;
        case 'Storing data':
            progress = 90; break;
        case 'Consensus established':
            progress = 100;
            $loadingScreen.classList.remove('show-instant');
            break;
    }

    $loadingProgress.style.width = progress + '%';
}

if(state.status !== 'Consensus established' && state.numberOfWallets > 0) {
    $loadingScreen.classList.add('show-instant');
    setLoadingScreen();
}

$buttonShowMyWallets.setAttribute('title', 'My Wallets (' + state.numberOfWallets + ')');
$name.innerText            = state.activeWallet.name;
$address.innerText         = state.activeWallet.address;
$balance.innerText         = formatBalance(state.activeWallet.balance);
$status.innerText          = state.status;
$height.innerText          = state.height;
$peers.innerText           = state.peers;

if(state.numberOfWallets === 0) $walletImport.classList.add('show-instant');

function setStatusIndicator(status) {
    if(status === 'Consensus established') {
        $statusIndicator.classList.add('green');
    }
    else if(status === 'Consensus lost' || status === 'Not connected') {
        $statusIndicator.classList.remove('green', 'yellow');
        // Set to default red
    }
    else { // All syncing cases
        $statusIndicator.classList.remove('green');
        $statusIndicator.classList.add('yellow');
    }
}
setStatusIndicator(state.status);

function createIdenticon(hash) {
    var el = document.createElement('div');
    el.setAttribute('height', '40px');
    el.setAttribute('width', '40px');

    Robohash.render(hash, el);

    return el;
}
$identicon.replaceChild(createIdenticon(state.activeWallet.address), $identicon.firstChild);

function setMinerStatus(mining) {
    if(mining) {
        $buttonToggleMining.innerHTML = 'Miner <i class="fa fa-gear fa-spin"></i>';
        $buttonToggleMining.classList.add('mining');
    }
    else {
        $buttonToggleMining.innerHTML = 'Miner <i class="fa fa-power-off"></i>';
        $buttonToggleMining.classList.remove('mining');
    }
}
setMinerStatus(state.mining);
$inputMiningThreads.value = state.threads;

function formatHashrate(value) {
    var resultValue = 0;
    var resultUnit = 'H/s';

    if(value < 1000) {
        resultValue = value;
    }
    else {
        let kilo = value / 1000;
        if(kilo < 1000) {
            resultValue = kilo;
            resultUnit = 'kH/s';
        }
        else {
            let mega = kilo / 1000;
            if(mega < 1000) {
                resultValue = mega;
                resultUnit = 'MH/s';
            }
            else {
                resultValue = mega / 1000;
                resultUnit = 'GH/s';
            }
        }
    }

    resultValue = Math.round(resultValue * 100) / 100;
    return resultValue + " " + resultUnit;
}
$buttonToggleMining.setAttribute('data-hashrate', formatHashrate(state.hashrate));

async function updateWalletList() {
    if(state.status !== 'Consensus established') return;

    var wallets = await bgPage.listWallets();

    let walletListItems = document.createDocumentFragment();

    for(let address in wallets) {
        let listItem = document.createElement('div');
        listItem.classList.add('wallet-list-item');

        let active = false;

        if(address === state.activeWallet.address) {
            listItem.classList.add('active');
            active = true;
        }

        listItem.innerHTML = `
            ${active ?
                `<div class="wallet-identicon" title="Active wallet"></div>` :
                wallets[address].analysingHistory ?
                    `<div class="wallet-identicon" title="Analysing history..."><i class="fa fa-refresh fa-spin"></i></div>` :
                    `<button class="use-wallet wallet-identicon" data-wallet="${address}" title="Use wallet">Use</button>`
            }&#8203;

            <span class="wallet-name">${wallets[address].name}</span> <i class="fa fa-pencil wallet-edit-name" title="Edit name"></i>

            <span class="wallet-name-input">
                <input type="text" value="${wallets[address].name}" data-original-value="${wallets[address].name}">
                <i class="fa fa-check wallet-update-name" data-wallet="${address}" title="Save"></i>
                <i class="fa fa-times wallet-cancel-name" title="Cancel"></i>
            </span>

            <hash class="wallet-address">${address}</hash>
            <i class="fa fa-copy wallet-copy-address" data-wallet="${address}" title="Copy address"></i><br>
            <i class="fa fa-key fa-fw wallet-export-privkey" data-wallet="${address}" title="Copy private key"></i>
            ${active ? `` : `<i class="fa fa-trash-o fa-fw wallet-remove" data-wallet="${address}" title="Remove wallet"></i>`}
            <span class="wallet-balance icon-nimiq">${formatBalance(wallets[address].balance)}</span>
        `;

        listItem.querySelector('.wallet-identicon').insertBefore(createIdenticon(address), listItem.querySelector('.wallet-identicon').firstChild);

        walletListItems.appendChild(listItem);
    }

    while ($walletList.firstChild) {
        $walletList.removeChild($walletList.firstChild);
    }

    $walletList.appendChild(walletListItems);
}
updateWalletList();

function renderPendingTxs(pendingTxs) {
    let pendingTxsItems = document.createDocumentFragment();

    for(tx of pendingTxs) {
        let listItem = document.createElement('div');
        listItem.classList.add('history-list-item', 'active');

        listItem.innerHTML = `
            ${tx.value ? `<span class="event-balance icon-nimiq ${tx.type === 'receiving' ? 'green">+' : 'red">-'}${formatBalance(tx.value)}&#8203;</span>` : ``}
            <span class="event-type pending">${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} transaction</span><br>
            ${tx.type === 'receiving' ? '&larr;' : '&rarr;'} <hash class="event-address">${tx.address}</hash>
        `;

        pendingTxsItems.appendChild(listItem);
    }

    while ($pendingHistoryList.firstChild) {
        $pendingHistoryList.removeChild($pendingHistoryList.firstChild);
    }

    $pendingHistoryList.appendChild(pendingTxsItems);
}
renderPendingTxs(state.pendingTxs);

async function updateHistory(page) {
    if(state.activeWallet.address) renderHistory(await bgPage.getHistory(state.activeWallet.address, page));
}

function renderHistory(history) {
    let historyItems = document.createDocumentFragment();

    for(event of history) {
        let listItem = document.createElement('div');
        listItem.classList.add('history-list-item');

        event.timestamp = (new Date(event.timestamp * 1000));

        switch(event.type) {
            case 'received':
            case 'sent':
                listItem.innerHTML = `
                    <span class="event-balance icon-nimiq ${event.type === 'received' ? 'green">+' : 'red">-'}${formatBalance(event.value)}&#8203;</span>
                    <span class="event-type">${event.type.charAt(0).toUpperCase() + event.type.slice(1)} transaction</span><br>
                    <span class="event-date">${event.timestamp.toLocaleString()}</span> <span class="event-height">(#${event.height})</span><br>
                    ${event.type === 'received' ? '&larr;' : '&rarr;'} <hash class="event-address">${event.address}</hash>
                `; break;
            case 'blockmined':
                listItem.innerHTML = `
                    <span class="event-balance icon-nimiq green">+${formatBalance(event.value)}&#8203;</span>
                    <span class="event-type">Mined block</span><br>
                    <span class="event-date">${event.timestamp.toLocaleString()}</span> <span class="event-height">(#${event.height})</span><br>
                `; break;
            case 'historygap':
                listItem.innerHTML = `
                    <span class="event-type">No data available</span><br>
                    before <span class="event-date">${event.timestamp.toLocaleString()}</span> <span class="event-height">(#${event.height})</span><br>
                `; break;
            case 'loadmore':
                listItem.innerHTML = `<button class="loadmore centered" data-page="${event.nextPage}">load more</button>`;
        }

        historyItems.appendChild(listItem);
    }

    if(!history.length) {
        let listItem = document.createElement('span');
        listItem.id = 'historyPlaceholder';
        listItem.innerText = 'No events';

        historyItems.appendChild(listItem);
    }

    while ($historyList.firstChild) {
        $historyList.removeChild($historyList.firstChild);
    }

    $historyList.appendChild(historyItems);
}
updateHistory();

if(state.status === 'Consensus established') bgPage.setUnreadEventsCount();

function handleStatus(status) {
    $status.innerText = status;
    setLoadingScreen();
    setStatusIndicator(status);
    updateWalletList();
}

function handleHeight(height) {
    if(state.status === 'Consensus established') {
        $height.innerText = height;
        updateHistory();
        updateWalletList();
    }
}

// Listen for updates from the background script
async function messageReceived(update) {
    console.log("message received:", update);

    var key = Object.keys(update)[0];

    if(key === 'privKey') {
        var address = await importPrivateKey(update.privKey);
        if(!state.activeWallet.address) {
            switchWallet(address);
            $walletImport.classList.remove('show-instant');
        }
        $buttonCloseImportWallets.click();
    }
    else if(key === 'doneAnalysing') {
        updateWalletList();
    }
    else {
        if(key === 'balance') {
            // Skip balance updates during wallet switch
            if(state.balance === 'loading...' && state.status !== 'Consensus established')
                return;
        }

        Object.assign(state, update);

        switch(key) {
            case 'numberOfWallets': $buttonShowMyWallets.setAttribute('title', 'My Wallets (' + state.numberOfWallets + ')'); break;
            case 'activeWallet': $name.innerText         = state.activeWallet.name;
                                 $address.innerText      = state.activeWallet.address;
                                 $balance.innerText      = formatBalance(state.activeWallet.balance);
                                 $identicon.replaceChild(createIdenticon(state.activeWallet.address), $identicon.firstChild);
                                 updateHistory();
                                 updateWalletList();
                                 break;
            case 'status':       handleStatus(state.status); break;
            case 'height':       handleHeight(state.height); break;
            case 'peers':        $peers.innerText        = state.peers; break;
            case 'mining':       setMinerStatus(state.mining); break;
            case 'threads':      $inputMiningThreads.value = state.threads; break;
            case 'hashrate':     $buttonToggleMining.setAttribute('data-hashrate', formatHashrate(state.hashrate)); break;
            case 'pendingTxs':   renderPendingTxs(state.pendingTxs); break;
        }
    }
}
chrome.runtime.onMessage.addListener(messageReceived);

async function sendTransaction() {
    var address = $inputTxReceiver.value;
    var value = parseFloat($inputTxValue.value);

    var error = await bgPage.sendTransaction(address, value);

    if(error) {
        alert(error);
    }
    else $buttonCloseNewTx.click();
}

async function importPrivateKey(key) {
    var address = await bgPage.importPrivateKey(key);
    updateWalletList();
    return address;
}

async function updateName(address, name) {
    await bgPage.updateName(address, name);
    showToast('Saved!');
    updateWalletList();
}

async function createNewWallet() {
    var address = await bgPage.createNewWallet();
    updateWalletList();
    return address;
}

async function removeWallet(address) {
    if(!confirm('Do you really want to un-manage this wallet?\n\n' + address.toUpperCase())) return;

    await bgPage.removeWallet(address);
    updateWalletList();
}

function switchWallet(address) {
    var result = bgPage.switchWallet(address);

    if(result === false) {
        showToast('Analysing history, please wait', true);
        return false;
    }

    if(state.numberOfWallets < 2) {
        $loadingScreen.classList.add('show-instant');
        setLoadingScreen();
    }

    return true;
}

function showToast(msg, longer) {
    $toast.classList.remove('show', 'fade-out');

    $toast.firstChild.innerText = msg;

    $toast.classList.add('show');

    window.setTimeout(() => {
        $toast.classList.add('fade-out');
    }, longer ? 1200 : 200);

    window.setTimeout(() => {
        $toast.classList.remove('show', 'fade-out');
    }, longer ? 1500 : 500); // 200 + 300 from CSS transition
}

function clipboard(data) {
    var input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.value = data;

    $walletList.appendChild(input);
    input.select();
    document.execCommand('copy');
    $walletList.removeChild(input);

    showToast('Copied!');
}

// Attach input listeners
$buttonCopyAddress.addEventListener('click', e => {
    clipboard(state.activeWallet.address);
});
$buttonNewTx.addEventListener('click', e => {
    $newTx.classList.add('show');
});
$buttonCloseNewTx.addEventListener('click', e => {
    $newTx.classList.remove('show');
})
$buttonSendTx.addEventListener('click', sendTransaction);

$buttonToggleMining.addEventListener('click', e => {
    if(!state.mining) bgPage.startMining();
    else bgPage.stopMining();
});

$inputMiningThreads.addEventListener('change', e => {
    bgPage.setMiningThreads($inputMiningThreads.value);
});

$historyList.addEventListener('click', e => {
    if(e.target.matches('.loadmore')) {
        updateHistory(parseInt(e.target.getAttribute('data-page')));
    }
});

$buttonShowMyWallets.addEventListener('click', e => {
    $walletManagement.classList.toggle('show');
});
$buttonCloseMyWallets.addEventListener('click', e => {
    $walletManagement.classList.remove('show');
});

$buttonShowImportWallets.addEventListener('click', e => {
    $walletImport.classList.add('show');
});
$buttonCloseImportWallets.addEventListener('click', e => {
    $walletImport.classList.remove('show');
});

$walletList.addEventListener('click', e => {
    var target = e.target;

    if(e.target.matches('canvas'))
        target = e.target.parentNode;

    if(target.matches('button.use-wallet')) {
        const address = target.getAttribute('data-wallet');
        if(switchWallet(address)) $buttonCloseMyWallets.click();
    }
    else if(target.matches('i.wallet-edit-name')) {
        target.parentNode.querySelector('.wallet-name').style.display = 'none';
        target.style.display = 'none';

        target.parentNode.querySelector('.wallet-name-input').style.display = 'initial';
        target.parentNode.querySelector('input').select();
    }
    else if(target.matches('i.wallet-update-name')) {
        const address = target.getAttribute('data-wallet');
        const name = target.parentNode.querySelector('input').value;
        updateName(address, name);
    }
    else if(target.matches('i.wallet-cancel-name')) {
        var input = target.parentNode.querySelector('input');
        input.parentNode.style.display = 'none';
        input.value = input.getAttribute('data-original-value');

        target.parentNode.parentNode.querySelector('.wallet-name').style.display = 'initial';
        target.parentNode.parentNode.querySelector('.wallet-edit-name').style.display = 'initial';
    }
    else if(target.matches('i.wallet-copy-address')) {
        const address = target.getAttribute('data-wallet');
        clipboard(address);
    }
    else if(target.matches('i.wallet-export-privkey')) {
        const address = target.getAttribute('data-wallet');
        bgPage.store.get('wallets', function(items) {
            var wallets = items.wallets;
            var key = wallets[address].key;
            clipboard(key);
        });
    }
    else if(target.matches('i.wallet-remove')) {
        const address = target.getAttribute('data-wallet');
        removeWallet(address);
    }
});

$buttonImportPrivKey.addEventListener('click', async e => {
    var address = await importPrivateKey($inputPrivKey.value);
    if(!state.activeWallet.address) {
        switchWallet(address);
        $walletImport.classList.remove('show-instant');
    }
    $buttonCloseImportWallets.click();
});
$buttonImportTestnet.addEventListener('click', e => {
    chrome.tabs.query({active: true}, tabs => {
        var tab = tabs[0];
        if(tab.url === 'https://nimiq.com/wallet/') {
            chrome.tabs.executeScript({file: "extract_testnet_key.js"});
        }
        else {
            chrome.tabs.create({ url: 'https://nimiq.com/wallet' });
        }
    });
});
$buttonNewWallet.addEventListener('click', async e => {
    var address = await createNewWallet();
    if(!state.activeWallet.address) {
        switchWallet(address);
        $walletImport.classList.remove('show-instant');
    }
    $buttonCloseImportWallets.click();
});

$version.innerText = 'v' + chrome.runtime.getManifest().version;
