// content.js
(function() {
  if (window.hasRunLabelCheckerWidgetInit) return;
  window.hasRunLabelCheckerWidgetInit = true;

  let lastUrl = location.href;
  let scanTimeout = null;

  function scheduleScan(delay = 2500) {
      if (scanTimeout) clearTimeout(scanTimeout);
      scanTimeout = setTimeout(runExtraction, delay);
  }

  // Monitor SPA URL changes
  const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
          lastUrl = location.href;
          const existing = document.getElementById('ing-label-checker-widget');
          if (existing) existing.remove();
          scheduleScan();
      }
  });
  observer.observe(document, { subtree: true, childList: true });

  // Initial scan
  scheduleScan();

  async function runExtraction() {
    let productName = "Unknown Product";
    const titleSelectors = ['#productTitle', 'h1', '[property="og:title"]', 'meta[itemprop="name"]', '[itemprop="name"]', '.product-title'];
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        if (el.tagName.toLowerCase() === 'meta') { productName = el.getAttribute('content'); }
        else { productName = el.innerText || el.textContent; }
        if (productName) break;
      }
    }

    let barcode = null;
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
          const data = JSON.parse(script.innerText);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
              if (item && (item['@type'] === 'Product' || item.gtin13 || item.gtin14 || item.gtin8 || item.sku)) {
                  let potentialCode = item.gtin13 || item.gtin14 || item.gtin8 || item.sku || item.mpn;
                  if (potentialCode && typeof potentialCode === 'string' && potentialCode.length >= 8 && /^[0-9]+$/.test(potentialCode)) {
                     barcode = potentialCode;
                     break;
                  }
              }
          }
          if (barcode) break;
      }
      if (!barcode) {
          const elements = document.querySelectorAll('th, td, span, strong, div');
          for (const el of elements) {
              const text = (el.innerText || "").trim().toLowerCase();
              if (text === 'ean' || text === 'upc' || text === 'barcode') {
                  let next = el.nextElementSibling || (el.parentElement ? el.parentElement.nextElementSibling : null);
                  if (next && next.innerText) {
                      let val = next.innerText.trim();
                      if (/^[0-9]{8,14}$/.test(val)) {
                          barcode = val;
                          break;
                      }
                  }
              }
          }
      }
    } catch(e) {}

    let ingredientsStr = "";
    // Ingredient extraction
    let fullText = "";
    const importantBox = document.querySelector('#important-information, #importantInformation');
    if (importantBox) {
        fullText = importantBox.innerText || "";
    } else {
        fullText = document.body.innerText || "";
    }
    
    let match = fullText.match(/Ingredients?:?([\s\S]*?)(?:\n\n|\n[A-Z][a-z]+:|$)/i);
    if (match && match[1] && match[1].trim().length > 10) {
        ingredientsStr = match[1].trim();
    }

    if (!ingredientsStr) {
       const allElements = document.querySelectorAll('div, p, span, h1, h2, h3, h4, h5, h6, li, td, th');
        for (const el of allElements) {
            const text = (el.innerText || "").trim();
            const lowerText = text.toLowerCase();
            if (text.length > 2000) continue;

            if ((lowerText.startsWith('ingredients:') || lowerText.startsWith('ingredients\n')) && text.length > 20) {
                ingredientsStr = text.substring(text.toLowerCase().indexOf('ingredients') + 11).replace(/^:/, '').trim();
                break;
            }
            if (lowerText === 'ingredients' || lowerText === 'ingredients:' || lowerText === 'ingredient list') {
                let next = el.nextElementSibling;
                if (next && next.innerText && next.innerText.trim().length > 10) {
                    ingredientsStr = next.innerText.trim();
                    break;
                }
                let parentNext = el.parentElement ? el.parentElement.nextElementSibling : null;
                if (parentNext && parentNext.innerText && parentNext.innerText.trim().length > 10) {
                    ingredientsStr = parentNext.innerText.trim();
                    break;
                }
            }
        }
    }

    let isCategoryPage = false;
    if (document.querySelector('.s-search-results, [data-component-type="s-search-result"], .s-result-list')) {
        isCategoryPage = true;
    }
    
    let isFood = false;
    let foodScore = 0;
    if (ingredientsStr) {
        foodScore += 10;
    }
    
    const foodKeywords = ['food', 'grocery', 'cereal', 'snack', 'biscuit', 'cookie', 'chocolate', 'chips', 'noodle', 'pasta', 'rice', 'flour', 'bread', 'sauce', 'ketchup', 'spice', 'masala', 'tea', 'coffee', 'juice', 'milk', 'beverage', 'drink', 'protein', 'bar', 'candy', 'sweet', 'frozen', 'ready to eat', 'ingredient', 'nutrition', 'calorie', 'allergen', 'pantry', 'jam', 'peanut butter', 'grocery'];
    const nonFoodKeywords = ['laptop', 'phone', 'mobile', 'smartphone', 'tablet', 'television', 'tv', 'monitor', 'keyboard', 'mouse', 'headphone', 'earbud', 'camera', 'charger', 'cable', 'shirt', 'shoe', 'jeans', 'watch', 'bag', 'furniture', 'sofa', 'chair', 'detergent', 'shampoo', 'soap', 'cosmetic', 'perfume', 'book', 'toy', 'appliance', 'electronics', 'fashion', 'clothing', 'beauty', 'auto', 'car', 'accessory', 'cover', 'case'];
    
    const titleLower = productName.toLowerCase();
    
    let breadcrumbText = "";
    const breadcrumbs = document.querySelectorAll('.a-breadcrumb, .breadcrumb, [data-feature-name="wayfinding-breadcrumbs"], #wayfinding-breadcrumbs_feature_div');
    if (breadcrumbs) {
        breadcrumbs.forEach(b => breadcrumbText += b.innerText.toLowerCase() + " ");
    }
    
    const combinedText = titleLower + " " + breadcrumbText;
    for (let w of foodKeywords) {
        if (combinedText.includes(w)) foodScore += 2;
    }
    for (let w of nonFoodKeywords) {
        if (combinedText.includes(w)) foodScore -= 3;
    }
    
    isFood = foodScore > 0;

    let ingredientsList = [];
    if (ingredientsStr) {
        ingredientsStr = ingredientsStr.replace(/contains\s+[^\n.]+/i, '');
        ingredientsStr = ingredientsStr.replace(/may contain\s+[^\n.]+/i, '');
        
        let items = ingredientsStr.split(",");
        for(let item of items) {
            item = item.replace(/\n/g, ' ').trim().replace(/\.$/, '');
            if(item.length > 1 && !item.toLowerCase().startsWith('contains') && !item.toLowerCase().startsWith('may contain')) {
                ingredientsList.push(item);
            }
        }
    }

    if (isCategoryPage || !isFood) return;

    if (barcode) {
        try {
            const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
            if (offRes.ok) {
                const offData = await offRes.json();
                if (offData.product && offData.product.ingredients && offData.product.ingredients.length > 0) {
                    ingredientsList = offData.product.ingredients.map(i => i.text.replace(/_*/g, "").trim()).filter(i => i);
                    productName = offData.product.product_name || productName;
                }
            }
        } catch (err) {}
    }

    if (!ingredientsList || ingredientsList.length === 0) return;

    // We have ingredients, ask the backend
    chrome.storage.local.get(["diet", "alsoAvoid", "language"], async (res) => {
      const diet = res.diet || "Vegetarian";
      const alsoAvoidStr = res.alsoAvoid || "";
      const alsoAvoid = alsoAvoidStr.split(",").map(i => i.trim()).filter(i => i);
      const language = res.language || "English";

      const reqBody = {
        product_name: productName,
        ingredients: ingredientsList,
        diet: diet,
        also_avoid: alsoAvoid,
        language: language,
        is_food: true
      };

      try {
        const response = await fetch("http://localhost:8000/check-product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody)
        });

        if (!response.ok) return;

        const data = await response.json();
        showFloatingWidget(data.verdict, diet);
      } catch (err) {
        console.error("Label Checker Widget Error:", err);
      }
    });
  }

  function showFloatingWidget(verdict, diet) {
    const existing = document.getElementById('ing-label-checker-widget');
    if (existing) return;

    const widget = document.createElement('div');
    widget.id = 'ing-label-checker-widget';
    widget.style.position = 'fixed';
    widget.style.bottom = '20px';
    widget.style.right = '20px';
    widget.style.zIndex = '999999';
    widget.style.padding = '12px 16px';
    widget.style.borderRadius = '8px';
    widget.style.fontFamily = 'Arial, sans-serif';
    widget.style.fontSize = '14px';
    widget.style.fontWeight = 'bold';
    widget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    widget.style.cursor = 'pointer';
    widget.style.transition = 'all 0.3s ease';
    
    let icon, text, bg, color;
    if (verdict === 'fits') {
      icon = '🟢'; text = 'FITS'; bg = '#e8f5e9'; color = '#2e7d32';
    } else if (verdict === 'doubtful') {
      icon = '🟡'; text = 'DOUBTFUL'; bg = '#fff8e1'; color = '#f57f17';
    } else {
      icon = '🔴'; text = 'DOES NOT FIT'; bg = '#ffebee'; color = '#c62828';
    }

    widget.style.backgroundColor = bg;
    widget.style.color = color;
    widget.style.border = `1px solid ${color}`;
    widget.innerText = `${icon} ${diet}: ${text}`;

    widget.addEventListener('mouseenter', () => { widget.style.transform = 'scale(1.05)'; });
    widget.addEventListener('mouseleave', () => { widget.style.transform = 'scale(1)'; });
    widget.addEventListener('click', () => {
        widget.remove();
    });

    document.body.appendChild(widget);
  }
})();
