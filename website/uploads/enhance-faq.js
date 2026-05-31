const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, 'site');

// Find all FAQ pages
function findFaqPages(dir) {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...findFaqPages(fullPath));
    } else if (item.name === 'faq.html') {
      results.push(fullPath);
    }
  }
  return results;
}

// Clean HTML to plain text
function cleanHtml(str) {
  return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

// Check if text looks like a question
function isQuestion(text) {
  return text.match(/\?$|^Q\d|^(What|How|Why|When|Can|Does|Is|Will|Are|Who|Which|Do|Should|Where)\b/i);
}

// Extract Q&A pairs from HTML
function extractFaqPairs(html) {
  const pairs = [];
  const seen = new Set();

  // Pattern 1: <h3>/<h4> with question text followed by <p> answer
  const headingPattern = /<h[34][^>]*>([\s\S]*?)<\/h[34]>/gi;
  let match;
  while ((match = headingPattern.exec(html)) !== null) {
    const question = cleanHtml(match[1]);
    if (!isQuestion(question) || question.length < 10) continue;

    const afterHeading = html.substring(match.index + match[0].length, match.index + match[0].length + 2000);
    const answerMatch = afterHeading.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (answerMatch) {
      const answer = cleanHtml(answerMatch[1]);
      if (answer.length > 20 && !seen.has(question)) {
        seen.add(question);
        pairs.push({ question, answer: answer.substring(0, 500) });
      }
    }
  }

  // Pattern 2: <details>/<summary> accordion pattern
  const detailsPattern = /<summary[^>]*>([\s\S]*?)<\/summary>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/gi;
  while ((match = detailsPattern.exec(html)) !== null) {
    const question = cleanHtml(match[1]);
    if (question.length < 10) continue;
    const answer = cleanHtml(match[2]);
    if (answer.length > 20 && !seen.has(question)) {
      seen.add(question);
      pairs.push({ question, answer: answer.substring(0, 500) });
    }
  }

  // Pattern 3: <span> or <div> with question-like text in FAQ sections
  const spanQPattern = /<span[^>]*class="[^"]*font-bold[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  while ((match = spanQPattern.exec(html)) !== null) {
    const question = cleanHtml(match[1]);
    if (!isQuestion(question) || question.length < 10) continue;
    const afterSpan = html.substring(match.index + match[0].length, match.index + match[0].length + 2000);
    const answerMatch = afterSpan.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (answerMatch) {
      const answer = cleanHtml(answerMatch[1]);
      if (answer.length > 20 && !seen.has(question)) {
        seen.add(question);
        pairs.push({ question, answer: answer.substring(0, 500) });
      }
    }
  }

  return pairs;
}

// Process FAQ pages
const faqPages = findFaqPages(SITE);
console.log(`\nEnhancing ${faqPages.length} FAQ pages with structured data...\n`);

faqPages.forEach(filePath => {
  let html = fs.readFileSync(filePath, 'utf-8');
  const pairs = extractFaqPairs(html);

  if (pairs.length === 0) {
    console.log(`  SKIP: ${path.relative(SITE, filePath)} (no Q&A pairs found)`);
    return;
  }

  // Build FAQPage schema
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": pairs.slice(0, 15).map(p => ({
      "@type": "Question",
      "name": p.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": p.answer
      }
    }))
  };

  // Replace the empty FAQPage placeholder
  const emptyFaq = '{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}';
  html = html.replace(emptyFaq, JSON.stringify(faqSchema));

  fs.writeFileSync(filePath, html, 'utf-8');
  console.log(`  OK: ${path.relative(SITE, filePath)} (${pairs.length} Q&A pairs)`);
});

console.log('\nFAQ structured data enhancement complete.\n');
