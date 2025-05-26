// Word Memory Assistant - Popup Script

document.addEventListener('DOMContentLoaded', function() {
  const wordCountEl = document.getElementById('wordCount');
  const wordContainer = document.getElementById('wordContainer');
  const refreshBtn = document.getElementById('refreshBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const exportWordsBtn = document.getElementById('exportWordsBtn');
  const importWordsBtn = document.getElementById('importWordsBtn');
  const importFile = document.getElementById('importFile');

  // Load and display words when popup opens
  loadWords();

  // Event listeners
  refreshBtn.addEventListener('click', loadWords); // Consider if refresh is still needed with auto-updates
  clearAllBtn.addEventListener('click', clearAllWords);
  exportWordsBtn.addEventListener('click', exportWords);
  importWordsBtn.addEventListener('click', function() {
    importFile.click(); // Trigger hidden file input
  });
  importFile.addEventListener('change', importWords);

  function loadWords() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length === 0 || !tabs[0].id) {
        console.warn("No active tab found or tab has no ID. Falling back to storage.");
        loadWordsFromStorage();
        return;
      }
      // content.js sends words as an array of {word: "text", style: "styleName"}
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getWords'}, function(response) {
        if (chrome.runtime.lastError) {
          console.warn("Error sending message to content script:", chrome.runtime.lastError.message, "Falling back to storage.");
          loadWordsFromStorage();
        } else if (response && response.words && Array.isArray(response.words)) {
          displayWords(response.words); // response.words is already an array of objects
        } else {
          console.warn("Invalid response from content script or no words. Falling back to storage.");
          loadWordsFromStorage();
        }
      });
    });
  }

  function loadWordsFromStorage() {
    chrome.storage.local.get(['savedWordsMap'], function(result) {
      const wordsMap = result.savedWordsMap || {};
      const wordsArray = Object.keys(wordsMap).map(word => ({
        word: word,
        style: wordsMap[word].style 
      }));
      displayWords(wordsArray);
    });
  }

  // wordsArray is an array of objects: [{word: "text", style: "styleName"}, ...]
  function displayWords(wordsArray) {
    wordCountEl.textContent = wordsArray.length;
    
    if (wordsArray.length === 0) {
      wordContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <div>No words saved yet</div>
          <div style="font-size: 11px; margin-top: 4px;">Start collecting words by using hotkeys 2, 3, or 4 on any webpage!</div>
        </div>
      `;
      return;
    }

    // Sort words alphabetically by the word itself
    wordsArray.sort((a, b) => a.word.localeCompare(b.word));

    const wordsHTML = wordsArray.map(item => `
      <div class="word-item">
        <span class="word-text">${item.word} <span class="word-style">(${item.style || 'default'})</span></span>
        <button class="remove-btn" data-word="${item.word}">Remove</button>
      </div>
    `).join('');

    wordContainer.innerHTML = wordsHTML;

    // Add event listeners to remove buttons
    const removeButtons = wordContainer.querySelectorAll('.remove-btn');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const word = this.getAttribute('data-word');
        removeWord(word); // This will trigger a reload via storage change or direct call
      });
    });

    // Add scrollbar class if needed (it's already in HTML, but ensure it's dynamic if content shorter)
    if (wordContainer.scrollHeight > wordContainer.clientHeight) {
        wordContainer.classList.add('scrollbar');
    } else {
        wordContainer.classList.remove('scrollbar');
    }
  }

  function removeWord(word) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length === 0 || !tabs[0].id) {
        console.warn("No active tab for removeWord. Falling back to storage.");
        removeWordFromStorage(word);
        return;
      }
      // content.js will update its own state and storage.
      // The storage change listener in content.js should handle re-highlighting.
      // popup.js will reload its word list via its own storage listener or direct call.
      chrome.tabs.sendMessage(tabs[0].id, {action: 'removeWord', word: word}, function(response) {
        if (chrome.runtime.lastError) {
          console.warn("Error sending removeWord to content script:", chrome.runtime.lastError.message, "Falling back to storage.");
          removeWordFromStorage(word); // Fallback
        } else {
          loadWords(); // Reload words in popup after content script confirms (or attempts)
        }
      });
    });
  }

  function removeWordFromStorage(word) {
    chrome.storage.local.get(['savedWordsMap'], function(result) {
      const wordsMap = result.savedWordsMap || {};
      if (wordsMap.hasOwnProperty(word)) {
        delete wordsMap[word];
        chrome.storage.local.set({savedWordsMap: wordsMap}, function() {
          if (chrome.runtime.lastError) {
            console.error("Error setting storage after removing word:", chrome.runtime.lastError.message);
          } else {
            loadWords(); // Reload words in popup
          }
        });
      } else {
        loadWords(); // Word wasn't there, just reload
      }
    });
  }

  function clearAllWords() {
    if (confirm('Are you sure you want to remove all words from your list? This action cannot be undone.')) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs.length === 0 || !tabs[0].id) {
          console.warn("No active tab for clearAllWords. Falling back to storage.");
          clearWordsFromStorage();
          return;
        }
        // content.js will clear its state and storage.
        // Storage change listener in content.js handles re-highlighting.
        chrome.tabs.sendMessage(tabs[0].id, {action: 'clearAllWords'}, function(response) {
          if (chrome.runtime.lastError) {
            console.warn("Error sending clearAllWords to content script:", chrome.runtime.lastError.message, "Falling back to storage.");
            clearWordsFromStorage(); // Fallback
          } else {
            loadWords(); // Reload words in popup
          }
        });
      });
    }
  }

  function clearWordsFromStorage() {
    chrome.storage.local.set({savedWordsMap: {}}, function() { // Set to empty object
      if (chrome.runtime.lastError) {
        console.error("Error clearing words from storage:", chrome.runtime.lastError.message);
      } else {
        loadWords(); // Reload words in popup
      }
    });
  }

  function exportWords() {
    chrome.storage.local.get(['savedWordsMap'], function(result) {
      const wordsMap = result.savedWordsMap || {};
      if (Object.keys(wordsMap).length === 0) {
        alert('No words to export.');
        return;
      }
      // Exporting the map directly: {"word": {"style": "stylename"}, ...}
      const jsonString = JSON.stringify(wordsMap, null, 2);
      const blob = new Blob([jsonString], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: 'wordlist.json', // Stays the same
        saveAs: true
      }, function(downloadId) {
        if (chrome.runtime.lastError) {
          console.error("Download error:", chrome.runtime.lastError.message);
        }
        URL.revokeObjectURL(url); // Revoke after download starts or fails
      });
    });
  }

  function importWords(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const fileContent = e.target.result;
        const importedData = JSON.parse(fileContent);

        // Validate the imported structure: should be an object
        // where each value is an object with a 'style' property (string)
        if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
          alert('Invalid file format. Expected an object mapping words to styles.');
          return;
        }

        let isValidStructure = true;
        for (const word in importedData) {
          if (importedData.hasOwnProperty(word)) {
            const styleObj = importedData[word];
            if (typeof styleObj !== 'object' || styleObj === null || typeof styleObj.style !== 'string') {
              isValidStructure = false;
              break;
            }
          }
        }

        if (!isValidStructure) {
          alert('Invalid data structure in JSON file. Each word must map to an object with a "style" property (e.g., {"word1": {"style": "default"}, ...}).');
          return;
        }

        chrome.storage.local.set({savedWordsMap: importedData}, function() {
          if (chrome.runtime.lastError) {
            alert('Error saving imported words: ' + chrome.runtime.lastError.message);
          } else {
            loadWords(); // Reload words in popup
            alert('Words imported successfully! Page highlights will update based on the new list.');
            // Inform content script to refresh highlights if necessary.
            // Content.js already listens to storage changes which triggers highlightSavedWords.
            // However, sending a specific message can be more robust if the content script wasn't active during storage change.
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0] && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: 'refreshAllHighlights'}, function(response) {
                        if (chrome.runtime.lastError) {
                            console.warn("Could not send refreshAllHighlights message to content script or it's not loaded:", chrome.runtime.lastError.message);
                        }
                    });
                }
            });
          }
        });
      } catch (error) {
        alert('Error parsing JSON file: ' + error.message);
      }
    };
    reader.onerror = function() {
      alert('Error reading file.');
    };
    reader.readAsText(file);
    importFile.value = null; // Reset file input for next import
  }

  // Listen for storage changes to keep popup in sync
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'local' && changes.savedWordsMap) {
      // Data has changed, reload words in the popup
      loadWords();
    }
  });
});