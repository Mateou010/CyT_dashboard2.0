(function removeDecorativeEmoji() {
  const emojiPattern = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu;

  function clean(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(textNode => {
      const cleaned = textNode.nodeValue.replace(emojiPattern, '').replace(/\s{2,}/g, ' ');
      if (cleaned !== textNode.nodeValue) textNode.nodeValue = cleaned;
    });
  }

  clean(document.body);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.nodeValue = node.nodeValue.replace(emojiPattern, '').replace(/\s{2,}/g, ' ');
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      clean(node);
    }
  }))).observe(document.body, { childList: true, subtree: true });
})();
