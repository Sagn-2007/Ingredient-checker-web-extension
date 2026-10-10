# Ingredient Label Checker - Round 2

## Problem
In the original MVP, the Ingredient Label Checker provided basic dietary classifications based on static rules and a fallback LLM. However, it lacked sophisticated reasoning for complex allergen scenarios, health warnings for toxic/ultra-processed ingredients, and a seamless user experience that didn't require constantly clicking the extension popup.

## Existing Solution
The MVP already successfully implemented:
- Privacy-first edge computing architecture
- Deterministic rules engine to minimize LLM usage ($0 operational cost)
- Automatic DOM ingredient extraction
- Local Tesseract OCR for image scanning without external APIs
- Open Food Facts barcode fallback
- OpenRouter LLM integration for unknown ingredients

## New Round 2 Features

### 1. Smart Custom Profiling (LLM-Based Allergen Reasoning)
**User Problem Solved:** Users often want to avoid an entire category (e.g., "dairy") but the ingredient list contains a derivative (e.g., "casein" or "whey"). Naive substring matching fails here.
**Implementation:** We upgraded the OpenRouter LLM prompt in the backend to dynamically evaluate the user's `also_avoid` list against ingredients, using reasoning to catch non-obvious derivatives. We also improved the deterministic custom rule matcher using regex word boundaries (`\b`) to prevent false positives (e.g., avoiding "pea" shouldn't flag "peanut").

### 2. Health & Processing Notes
**User Problem Solved:** A product might fit a diet (e.g., Vegan) but still contain controversial additives (e.g., Red 40 or excessive ultra-processed elements).
**Implementation:** The LLM prompt was modified to output an informational `health_warning` field. The frontend `popup.js` was updated to render these notes prominently with an ℹ️ icon when potentially controversial dyes, artificial preservatives, or extreme processing are detected. It is designed to provide context, not definitive medical diagnoses.

### 3. On-Page Auto-Scanning Widget (Content Script)
**User Problem Solved:** Users had to manually open the popup to check a product.
**Implementation:** We created `content.js`, an intelligent background script that automatically scrapes DOM text on page load, queries the backend, and injects a subtle floating UI badge (e.g., "🟢 Vegan: FITS") directly onto the shopping webpage. This creates a zero-click, seamless shopping experience.

### 4. Personalized Custom Diet Profiles
**User Problem Solved:** The original application only offered three static profiles (Vegetarian, Vegan, Jain). Users with complex allergies or specific preferences (e.g., "Dad's Diet" avoiding sugar, dairy, and peanuts) had to constantly re-type their custom avoid lists.
**Implementation:** Users can now create, name, edit, and delete their own permanent diet profiles. The active profile's name (e.g., "🟢 Dad's Diet: FITS") seamlessly integrates into the floating zero-click widget and the backend. The custom profile name dynamically sets the `diet` variable without requiring a parallel backend logic path, maintaining architectural simplicity.

## Architecture
The architecture remains heavily privacy-focused and edge-first:
- **Local/Edge:** DOM Scraping, Tesseract OCR, Deterministic Rule Engine, Barcode API (Open Food Facts).
- **Remote/LLM:** Only ambiguous ingredients or complex allergen reasoning are sent to OpenRouter.

## Technical Innovations
- **Zero-Cost Vision AI:** Leveraging `tesseract.js` compiled to WebAssembly running locally inside the extension to avoid expensive Vision API calls.
- **Resilient AI Pipelines:** OpenRouter is wrapped in `tenacity` retries to survive free-tier rate limits, ensuring graceful degradation.
- **Intelligent Fallbacks:** Webpage DOM → Barcode Data → Open Food Facts API → Local OCR → Deterministic Rules → LLM Classification.

## Privacy Approach
- No user data is collected.
- Personal dietary preferences (`diet`, `also_avoid`) are stored locally via `chrome.storage.local`.
- Only minimal ingredient lists are sent to the backend/LLM, and no product images are ever uploaded.

## Limitations
- Heavily obscured ingredient lists in images might fail local OCR.
- E-commerce DOM structures change frequently, which might break the automated DOM scraping occasionally.

## Evaluation Metrics
- Accuracy of ingredient detection from various e-commerce platforms.
- Percentage of ingredients handled purely by deterministic rules vs. LLM.
- Responsiveness of the floating widget.

## Demo Flow
1. **Seamless Experience:** Navigate to an Amazon food product page. Without clicking anything, the bottom-right floating widget appears saying "🟢 Vegan: FITS".
2. **Health Notes:** Open a product containing "Red 40". Click the extension, and show the ℹ️ Health Note under the ingredient analysis.
3. **Smart Profiling:** Add "dairy" to the "Also avoid" list in the extension. Scan a product containing "casein". The LLM will flag it correctly despite no exact string match.
4. **Privacy & Edge OCR:** Right-click an ingredient image on a webpage and click "Scan image for ingredients". Watch the local OCR process the image without uploading it to a cloud vision API.

## Future Work
- Move the backend completely into the browser via local on-device small language models (SLMs) using WebGPU (e.g., WebLLM).
- Expand the deterministic database to cover 95%+ of common ingredients to further reduce LLM reliance.
