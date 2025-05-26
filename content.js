// Word Memory Assistant - Content Script

let isHotkeyPressed = false;
let hotkeyPressTimer = null;
let activeHotkey = null; // To track which hotkey is pressed ('2', '3', '4', '5')
let savedWords = {}; // Changed from Set to Object to store words and their styles
let lastMouseEvent = null;
let mutationObserver = null;

// Default style
const STYLE_DEFAULT = 'default';
const STYLE_GREEN = 'green';
const STYLE_UNDERLINE = 'underline';

// Load saved words from storage
chrome.storage.local.get(['savedWordsMap'], function(result) {
  if (result.savedWordsMap && typeof result.savedWordsMap === 'object') {
    savedWords = result.savedWordsMap;
  } else {
    // Migration from old Set format if necessary
    chrome.storage.local.get(['savedWords'], function(oldResult) {
      if (oldResult.savedWords && Array.isArray(oldResult.savedWords)) {
        savedWords = {};
        oldResult.savedWords.forEach(word => {
          savedWords[word] = { style: STYLE_DEFAULT };
        });
        saveWordsToStorage(); // Save in new format
      } else {
        savedWords = {};
      }
    });
  }

  function onDomReady() {
    if (Object.keys(savedWords).length > 0) {
      highlightSavedWords(); // Initial highlight for static content
    }
    initMutationObserver(); // Start observing for dynamic content
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReady);
  } else {
    onDomReady();
  }
});

// Track mouse position
document.addEventListener('mousemove', function(e) {
  lastMouseEvent = e;
});

// --- Helper Functions ---
function getSelectedWord() {
  return lastMouseEvent ? getWordUnderCursor(lastMouseEvent) : null;
}

function isWordSaved(word) {
  return word && savedWords.hasOwnProperty(word);
}

function getWordStyle(word) {
  if (isWordSaved(word)) {
    return savedWords[word].style;
  }
  return null;
}

// --- Hotkey Event Listeners ---
const HOTKEYS = ['2', '3', '4', '5'];
document.addEventListener('keydown', function(e) {
  if (HOTKEYS.includes(e.key) && !isHotkeyPressed) {
    isHotkeyPressed = true;
    activeHotkey = e.key;
    clearTimeout(hotkeyPressTimer);

    hotkeyPressTimer = setTimeout(() => {
      if (isHotkeyPressed && activeHotkey && lastMouseEvent) {
        const word = getSelectedWord();
        if (word && word.length > 2) { // Basic validation
          handleHotkeyAction(activeHotkey, word);
        }
      }
      // Reset after action or if conditions not met
      isHotkeyPressed = false;
      activeHotkey = null;
    }, 500); // 0.5-second delay
  }
});

document.addEventListener('keyup', function(e) {
  if (HOTKEYS.includes(e.key)) {
    if (isHotkeyPressed && activeHotkey === e.key) {
      // Key was released before 0.5s timer fired
      clearTimeout(hotkeyPressTimer);
      isHotkeyPressed = false;
      activeHotkey = null;
    }
  }
});

function handleHotkeyAction(key, word) {
  const wordIsSaved = isWordSaved(word);
  const currentStyle = getWordStyle(word);

  switch (key) {
    case '2':
      if (wordIsSaved) {
        if (currentStyle === STYLE_GREEN || currentStyle === STYLE_UNDERLINE) {
          // Change to default style
          applyStyle(word, STYLE_DEFAULT);
          showMessage(`"${word}" style changed to default.`, 'info');
        } else {
          // If default or any other, remove it (toggle off)
          removeWordFromList(word);
          // message is shown by removeWordFromList
        }
      } else {
        // Add with default style
        addWordToList(word, STYLE_DEFAULT);
        // message is shown by addWordToList
      }
      break;
    case '3':
      if (wordIsSaved) {
        if (currentStyle !== STYLE_GREEN) {
          applyStyle(word, STYLE_GREEN);
          showMessage(`"${word}" style changed to green.`, 'info');
        } else {
          showMessage(`"${word}" is already green.`, 'info');
        }
      } else {
        addWordToList(word, STYLE_GREEN);
      }
      break;
    case '4':
      if (wordIsSaved) {
        if (currentStyle !== STYLE_UNDERLINE) {
          applyStyle(word, STYLE_UNDERLINE);
          showMessage(`"${word}" style changed to underline.`, 'info');
        } else {
          showMessage(`"${word}" is already underline.`, 'info');
        }
      } else {
        addWordToList(word, STYLE_UNDERLINE);
      }
      break;
    case '5':
      if (wordIsSaved) {
        removeWordFromList(word);
        // message is shown by removeWordFromList
      } else {
        showMessage(`"${word}" is not in your list.`, 'info');
      }
      break;
  }
}

// Extract word under cursor
function getWordUnderCursor(e) {
  const element = e.target;
  let word = null;

  // Priority 1: Check if the cursor is directly over a highlight span
  const highlightClasses = ['word-memory-highlight', `word-memory-highlight-${STYLE_GREEN}`, `word-memory-highlight-${STYLE_UNDERLINE}`];
  for (const cls of highlightClasses) {
    if (element.classList.contains(cls)) {
      const textFromHighlight = element.textContent.toLowerCase().trim();
      if (textFromHighlight.length > 2 && /^[a-zA-Z]+$/.test(textFromHighlight)) {
        return textFromHighlight;
      } else {
        return null;
      }
    }
  }
  
  // Priority 2: Skip script, style, or our own message elements if not a highlight
  if (element.tagName === 'SCRIPT' || 
      element.tagName === 'STYLE' ||
      element.closest('.word-memory-message')) {
    return null;
  }
  
  // Priority 3: Try multiple methods (simplified for brevity, original logic was more complex)
  const range = document.caretRangeFromPoint(e.clientX, e.clientY);
  if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer;
    const offset = range.startOffset;
    const textContent = textNode.textContent;
    let start = offset, end = offset;
    while (start > 0 && /[a-zA-Z]/.test(textContent[start - 1])) start--;
    while (end < textContent.length && /[a-zA-Z]/.test(textContent[end])) end++;
    if (start < end) {
      word = textContent.substring(start, end).toLowerCase();
    }
  }
  
  if (!word && (element.textContent || element.innerText)) {
     const text = (element.textContent || element.innerText).trim();
     // Basic word extraction if caretRangeFromPoint fails or not on text node
     // This is a simplified fallback. A more robust solution might involve
     // more sophisticated text segmentation if needed.
     const wordsInElement = text.split(/\s+/); // Split by space
     // A more targeted approach would be needed if the element contains multiple words
     // and we need the specific one under the cursor.
     // For now, if caretRangeFromPoint fails, this might pick up the first word
     // or a word if the element itself is small and mostly contains one word.
     if (wordsInElement.length > 0) {
        const potentialWord = wordsInElement[0].toLowerCase().replace(/[^a-z]/gi, '');
        if (potentialWord.length > 2) word = potentialWord;
     }
  }

  const resultWord = (word && word.length > 2 && /^[a-zA-Z]+$/.test(word)) ? word : null;
  return resultWord;
}


// Add word to saved list with a specific style
function addWordToList(word, style) {
  if (!word || !style) return;
  savedWords[word] = { style: style };
  saveWordsToStorage();
  removeHighlight(word); // Remove any existing highlight before applying new one
  applyStyleToWordOccurrences(word, style);
  showMessage(`"${word}" added with ${style} style.`, 'success');
}

// Remove word from saved list
function removeWordFromList(word) {
  if (!isWordSaved(word)) return;
  delete savedWords[word];
  saveWordsToStorage();
  removeHighlight(word); // This needs to remove all styles
  showMessage(`"${word}" removed from your word list.`, 'info');
}

// Apply a specific style to a word (updates if exists, adds if new)
function applyStyle(word, style) {
  if (!word || !style) return;
  savedWords[word] = { style: style };
  saveWordsToStorage();
  removeHighlight(word); // Remove previous styling first
  applyStyleToWordOccurrences(word, style);
  // Message is typically handled by the calling hotkey function
}

// Save words (now an object) to Chrome storage
function saveWordsToStorage() {
  chrome.storage.local.set({
    savedWordsMap: savedWords // Use a new key for the object format
  });
}

function getHighlightClass(style) {
  if (style === STYLE_GREEN) return `word-memory-highlight-${STYLE_GREEN}`;
  if (style === STYLE_UNDERLINE) return `word-memory-highlight-${STYLE_UNDERLINE}`;
  return 'word-memory-highlight'; // Default
}

// Highlight a specific word with a given style
function applyStyleToWordOccurrences(word, style, rootNode = document.body) {
  const className = getHighlightClass(style);
  const regex = new RegExp(`\\b${word}\\b`, 'gi');
  const walker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        if (node.parentElement) {
          const parentTag = node.parentElement.tagName;
          const parentClassList = node.parentElement.classList;
          if (parentTag === 'SCRIPT' || parentTag === 'STYLE' ||
              parentClassList.contains('word-memory-highlight') || // Default style
              parentClassList.contains(`word-memory-highlight-${STYLE_GREEN}`) || // Green style
              parentClassList.contains(`word-memory-highlight-${STYLE_UNDERLINE}`) || // Underline style
              node.parentElement.closest('.word-memory-highlight, .word-memory-highlight-green, .word-memory-highlight-underline')) {
            return NodeFilter.FILTER_REJECT;
          }
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  const textNodesToReplace = [];
  let currentNode;
  while (currentNode = walker.nextNode()) {
    if (rootNode.contains(currentNode) && regex.test(currentNode.textContent)) {
      regex.lastIndex = 0;
      textNodesToReplace.push(currentNode);
    }
  }

  textNodesToReplace.forEach(textNode => {
    if (!textNode.parentElement || !rootNode.contains(textNode)) return;
    
    // Check if parent itself became a highlight (e.g. by sibling node processing)
    const parentClasses = textNode.parentElement.classList;
    if (parentClasses.contains('word-memory-highlight') || 
        parentClasses.contains(`word-memory-highlight-${STYLE_GREEN}`) ||
        parentClasses.contains(`word-memory-highlight-${STYLE_UNDERLINE}`)) {
        return;
    }

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(textNode.textContent)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(textNode.textContent.substring(lastIndex, match.index)));
      }
      const span = document.createElement('span');
      span.className = className; // Apply style-specific class
      span.textContent = match[0];
      fragment.appendChild(span);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < textNode.textContent.length) {
      fragment.appendChild(document.createTextNode(textNode.textContent.substring(lastIndex)));
    }
    if (fragment.childNodes.length > 0) {
      textNode.parentElement.replaceChild(fragment, textNode);
    }
  });
}

// Highlight all saved words across the entire document based on their stored style
function highlightSavedWords() {
  for (const word in savedWords) {
    if (savedWords.hasOwnProperty(word)) {
      applyStyleToWordOccurrences(word, savedWords[word].style, document.body);
    }
  }
}

// Remove all highlights for a specific word, regardless of style
function removeHighlight(word) {
  const highlightSelectors = [
    '.word-memory-highlight', 
    `.word-memory-highlight-${STYLE_GREEN}`, 
    `.word-memory-highlight-${STYLE_UNDERLINE}`
  ];
  highlightSelectors.forEach(selector => {
    const highlights = document.querySelectorAll(selector);
    highlights.forEach(highlight => {
      if (highlight.textContent.toLowerCase() === word.toLowerCase()) {
        const parent = highlight.parentElement;
        if (parent) {
          parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
          parent.normalize(); // Merges adjacent text nodes
        }
      }
    });
  });
}

// Show success/info messages (no changes needed to this function itself)
function showMessage(text, type) {
  const message = document.createElement('div');
  message.className = `word-memory-message ${type}`;
  message.textContent = text;
  
  document.body.appendChild(message);
  
  setTimeout(() => {
    message.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    message.classList.remove('show');
    setTimeout(() => {
      if (message.parentElement) {
        message.parentElement.removeChild(message);
      }
    }, 300);
  }, 2000);
}

// MutationObserver callback and initialization
function mutationCallback(mutationsList, observer) {
  if (Object.keys(savedWords).length === 0) { // Adjusted for object
    return;
  }

  for (const mutation of mutationsList) {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach(addedNode => {
        if (addedNode.nodeType === Node.ELEMENT_NODE) {
          const classList = addedNode.classList;
          if (classList && (classList.contains('word-memory-highlight') || // Check all highlight classes
              classList.contains(`word-memory-highlight-${STYLE_GREEN}`) ||
              classList.contains(`word-memory-highlight-${STYLE_UNDERLINE}`)) ||
              addedNode.closest('.word-memory-message') ||
              addedNode.tagName === 'SCRIPT' || 
              addedNode.tagName === 'STYLE') {
            return; 
          }
          for (const word in savedWords) {
            if (savedWords.hasOwnProperty(word)) {
              applyStyleToWordOccurrences(word, savedWords[word].style, addedNode);
            }
          }
        } else if (addedNode.nodeType === Node.TEXT_NODE && addedNode.parentElement) {
          const parentElement = addedNode.parentElement;
          const parentClassList = parentElement.classList;
          if (parentClassList && (parentClassList.contains('word-memory-highlight') ||
              parentClassList.contains(`word-memory-highlight-${STYLE_GREEN}`) ||
              parentClassList.contains(`word-memory-highlight-${STYLE_UNDERLINE}`)) ||
              parentElement.closest('.word-memory-message') ||
              parentElement.tagName === 'SCRIPT' ||
              parentElement.tagName === 'STYLE') {
            return;
          }
          for (const word in savedWords) {
            if (savedWords.hasOwnProperty(word)) {
              applyStyleToWordOccurrences(word, savedWords[word].style, parentElement);
            }
          }
        }
      });
    }
  }
}

function initMutationObserver() {
  if (mutationObserver) {
    return; 
  }
  const observerOptions = {
    childList: true, 
    subtree: true    
  };
  mutationObserver = new MutationObserver(mutationCallback);
  mutationObserver.observe(document.body, observerOptions);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getWords') {
    // Send words with their styles
    const wordsWithStyles = [];
    for (const word in savedWords) {
      if (savedWords.hasOwnProperty(word)) {
        wordsWithStyles.push({ word: word, style: savedWords[word].style });
      }
    }
    sendResponse({words: wordsWithStyles});
  } else if (request.action === 'removeWord') {
    removeWordFromList(request.word); // Use new function
    sendResponse({success: true});
  } else if (request.action === 'clearAllWords') {
    const wordsToRemove = Object.keys(savedWords);
    savedWords = {}; // Clear local object
    saveWordsToStorage(); // Save empty object to storage
    
    // Remove all highlights from the page
    wordsToRemove.forEach(word => removeHighlight(word)); 
    
    sendResponse({success: true});
  }
});