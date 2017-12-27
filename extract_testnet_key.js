(function() {

    var scriptContent = "document.body.setAttribute('data-private-key', $.wallet.dump());\n";

    var script = document.createElement('script');
    script.id = 'my-nimiq-wallet-key-extractor';
    script.appendChild(document.createTextNode(scriptContent));
    (document.body || document.head || document.documentElement).appendChild(script);

    var privKey = document.body.getAttribute('data-private-key');
    document.body.removeAttribute('data-private-key');
    document.getElementById("my-nimiq-wallet-key-extractor").remove();

    chrome.runtime.sendMessage({privKey: privKey});
})();
