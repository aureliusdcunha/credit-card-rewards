(() => {
  const C = window.CRI;
  const escape = value => C.escapeHtml(value == null ? "" : value);
  const sourceLink = (item, card) => {
    const url = item && item.sourceUrl ? item.sourceUrl : card.officialUrl;
    return url
      ? '<a class="text-link modal-source-link" href="' + escape(url) + '" target="_blank" rel="noopener noreferrer">Open supporting issuer source ↗</a>'
      : '<span class="modal-source-missing">Supporting source link not recorded</span>';
  };
  const validity = item => {
    const parts = [];
    if (item.validFrom) parts.push("From " + item.validFrom);
    if (item.validTo) parts.push("Until " + item.validTo);
    return parts.join(" · ");
  };
  const sectionIntro = (text, count) =>
    '<div class="modal-section-intro"><p>' + escape(text) + '</p><span>' + count + '</span></div>';
  const emptyState = (title, body) =>
    '<div class="modal-empty"><strong>' + escape(title) + '</strong><p>' + escape(body) + '</p></div>';

  function renderBenefits(card) {
    const benefits = Array.isArray(card.benefits) ? card.benefits : [];
    let html = sectionIntro("Perks and services recorded from the issuer terms.", benefits.length + " benefit(s)");
    if (!benefits.length) {
      return html + emptyState("No benefits recorded yet", "Run source extraction and review the issuer quotations to add welcome, lounge, travel, dining, milestone and other card benefits.");
    }
    html += '<div class="modal-item-list">';
    html += benefits.map(benefit => {
      const dates = validity(benefit);
      return '<article class="modal-info-item">' +
        '<div class="modal-info-item-top"><h3>' + escape(benefit.name || "Card benefit") + '</h3>' +
        (benefit.status ? C.statusPill(benefit.status) : '') + '</div>' +
        '<p>' + escape(benefit.description || "No description supplied.") + '</p>' +
        (benefit.conditions ? '<div class="modal-detail-line"><strong>Eligibility / conditions</strong><span>' + escape(benefit.conditions) + '</span></div>' : '') +
        (benefit.sourceQuote ? '<blockquote class="modal-source-quote"><strong>Issuer quote</strong><br>“' + escape(benefit.sourceQuote) + '”</blockquote>' : '') +
        (dates ? '<div class="modal-detail-line"><strong>Validity</strong><span>' + escape(dates) + '</span></div>' : '') +
        sourceLink(benefit, card) +
        '</article>';
    }).join("");
    return html + '</div>';
  }

  function renderRules(card) {
    const rules = Array.isArray(card.rules) ? card.rules : [];
    const approvedRules = rules.filter(rule => rule.status === "approved").length;
    let html = sectionIntro("EARNING RULES // APPROVED RATE MATRIX", rules.length + " record(s) · " + approvedRules + " approved");
    if (!rules.length) {
      return html + emptyState("No reward rules available", "This card can have details and benefits without a verified earning rule. Do not use an estimated reward rate until a complete rate, spend basis, reward unit and official source quote have been reviewed.");
    }
    html += '<div class="terminal-table-wrap"><table class="terminal-table"><thead><tr>' +
      '<th scope="col">Category</th><th scope="col">Earning formula</th><th scope="col">Minimum</th><th scope="col">Cap / limit</th><th scope="col">Validity</th><th scope="col">Status / evidence</th>' +
      '</tr></thead><tbody>';
    html += rules.map(rule => {
      const dates = validity(rule);
      const unit = rule.unit || card.rewardCurrency || "rewards";
      const formula = C.formatNumber(rule.rate) + " " + unit + " / " + C.formatINR(rule.perAmount);
      const cap = rule.cap && typeof rule.cap === "object"
        ? (rule.cap.type === "spend" ? C.formatINR(rule.cap.value) : C.formatNumber(rule.cap.value) + " " + unit) +
          (rule.cap.period ? " per " + String(rule.cap.period).replace(/_/g, " ") : "") +
          (rule.cap.overCapCategory ? "; then " + String(rule.cap.overCapCategory).replace(/_/g, " ") : "")
        : "—";
      const minimum = rule.minTransaction != null && Number.isFinite(Number(rule.minTransaction)) && Number(rule.minTransaction) > 0
        ? C.formatINR(rule.minTransaction)
        : "—";
      const sourceEvidence = rule.sourceQuote
        ? '<blockquote>“' + escape(rule.sourceQuote) + '”</blockquote>'
        : '<p class="terminal-muted">No source quote recorded.</p>';
      return '<tr>' +
        '<td class="terminal-category">' + escape(C.prettyCategory(rule.category)) + '</td>' +
        '<td><span class="terminal-rate">' + escape(formula) + '</span>' +
          (rule.rounding ? '<small class="terminal-muted terminal-cell-note">Rounding: ' + escape(rule.rounding) + '</small>' : '') +
        '</td>' +
        '<td>' + escape(minimum) + '</td>' +
        '<td>' + escape(cap) + '</td>' +
        '<td>' + escape(dates || "Not dated") + '</td>' +
        '<td class="terminal-evidence">' +
          C.statusPill(rule.status) +
          '<details><summary>Inspect source evidence</summary>' + sourceEvidence + sourceLink(rule, card) + '</details>' +
          (rule.notes ? '<details><summary>Rule notes</summary><p>' + escape(rule.notes) + '</p></details>' : '') +
        '</td>' +
      '</tr>';
    }).join("");
    html += '</tbody></table></div>';
    html += '<p class="modal-muted-note">Rates remain tied to their quoted source. “—” means no value is recorded; it does not mean the condition is absent.</p>';
    return html;
  }

  function renderRestrictions(card) {
    const exclusions = Array.isArray(card.exclusions) ? card.exclusions : [];
    const rules = Array.isArray(card.rules) ? card.rules : [];
    const benefits = Array.isArray(card.benefits) ? card.benefits : [];
    const eligibilityBenefits = benefits.filter(benefit => {
      const detail = [benefit.name, benefit.description, benefit.conditions, benefit.sourceQuote].filter(Boolean).join(" ");
      const feeRelated = /\b(?:joining fee|annual fee|renewal fee|fee waiver|finance charge|late payment fee|foreign currency markup|forex markup)\b/i.test(detail);
      const hasCondition = Boolean(String(benefit.conditions || "").trim()) ||
        /\b(?:lounge|spend threshold|preceding calendar quarter|minimum spend|minimum .*transaction|eligibility|eligible spends?|priority pass|milestone spend|spend of|spends of|within the first \d+ days|upon spending)\b/i.test(detail);
      return !feeRelated && hasCondition;
    });
    const conditionalRules = rules.filter(rule =>
      rule.notes || rule.minTransaction != null || rule.cap || rule.validFrom || rule.validTo
    );
    let html = sectionIntro("Exclusions and benefit eligibility conditions that affect access or earning.", exclusions.length + " exclusion(s)");
    if (!exclusions.length) {
      html += emptyState("No exclusions recorded", "This does not mean the issuer has no exclusions. Confirm excluded merchant categories, MCCs, transaction types and other limitations in the current terms.");
    } else {
      html += '<div class="modal-item-list">';
      html += exclusions.map(exclusion => {
        const dates = validity(exclusion);
        const mcc = Array.isArray(exclusion.mccCodes) && exclusion.mccCodes.length
          ? exclusion.mccCodes.join(", ")
          : "";
        return '<article class="modal-info-item">' +
          '<div class="modal-info-item-top"><h3>' + escape(C.prettyCategory(exclusion.category || "all")) + '</h3>' +
          (exclusion.status ? C.statusPill(exclusion.status) : '') + '</div>' +
          '<p>' + escape(exclusion.reason || "Exclusion reason not supplied.") + '</p>' +
          (mcc ? '<div class="modal-detail-line"><strong>MCC codes</strong><span>' + escape(mcc) + '</span></div>' : '') +
          (exclusion.sourceQuote ? '<blockquote class="modal-source-quote"><strong>Issuer quote</strong><br>“' + escape(exclusion.sourceQuote) + '”</blockquote>' : '') +
          (dates ? '<div class="modal-detail-line"><strong>Validity</strong><span>' + escape(dates) + '</span></div>' : '') +
          sourceLink(exclusion, card) +
          '</article>';
      }).join("");
      html += '</div>';
    }

    html += '<h3 class="modal-subsection-title">Rule-specific conditions</h3>';
    if (!conditionalRules.length) {
      html += '<p class="modal-muted-note">No minimums, caps, validity windows or rule notes are recorded. Check the issuer terms for conditions not yet entered.</p>';
    } else {
      html += '<div class="modal-item-list">';
      html += conditionalRules.map(rule => {
        const dates = validity(rule);
        const cap = rule.cap && typeof rule.cap === "object"
          ? (rule.cap.type === "spend" ? C.formatINR(rule.cap.value) : C.formatNumber(rule.cap.value) + " " + (rule.unit || card.rewardCurrency || "rewards")) +
            (rule.cap.period ? " per " + String(rule.cap.period).replace(/_/g, " ") : "")
          : "";
        return '<article class="modal-info-item modal-compact-item">' +
          '<h3>' + escape(C.prettyCategory(rule.category)) + '</h3>' +
          (rule.notes ? '<p>' + escape(rule.notes) + '</p>' : '') +
          (rule.minTransaction != null && Number(rule.minTransaction) > 0 ? '<div class="modal-detail-line"><strong>Minimum transaction</strong><span>' + escape(C.formatINR(rule.minTransaction)) + '</span></div>' : '') +
          (cap ? '<div class="modal-detail-line"><strong>Cap / limit</strong><span>' + escape(cap) + '</span></div>' : '') +
          (dates ? '<div class="modal-detail-line"><strong>Validity</strong><span>' + escape(dates) + '</span></div>' : '') +
          sourceLink(rule, card) +
          '</article>';
      }).join("");
      html += '</div>';
    }
    html += '<h3 class="modal-subsection-title">Benefit eligibility conditions</h3>';
    if (!eligibilityBenefits.length) {
      html += '<p class="modal-muted-note">No benefit-specific eligibility conditions are recorded. This does not mean the issuer has no conditions; check the current official card terms.</p>';
    } else {
      html += '<div class="modal-item-list">';
      html += eligibilityBenefits.map(benefit => {
        const dates = validity(benefit);
        return '<article class="modal-info-item modal-compact-item">' +
          '<div class="modal-info-item-top"><h3>' + escape(benefit.name || "Benefit eligibility condition") + '</h3>' +
          (benefit.status ? C.statusPill(benefit.status) : '') + '</div>' +
          '<p>' + escape(benefit.description || "No description supplied.") + '</p>' +
          (benefit.conditions ? '<div class="modal-detail-line"><strong>Eligibility / spend condition</strong><span>' + escape(benefit.conditions) + '</span></div>' : '') +
          (benefit.sourceQuote ? '<blockquote class="modal-source-quote"><strong>Issuer quote</strong><br>“' + escape(benefit.sourceQuote) + '”</blockquote>' : '') +
          (dates ? '<div class="modal-detail-line"><strong>Validity</strong><span>' + escape(dates) + '</span></div>' : '') +
          sourceLink(benefit, card) +
          '</article>';
      }).join("");
      html += '</div>';
    }
    return html;
  }

  function renderFees(card) {
    const benefits = Array.isArray(card.benefits) ? card.benefits : [];
    const feeBenefits = benefits.filter(benefit =>
      /\b(?:fee|fees|waiv|joining|renewal|charge|markup|finance charge|late payment|foreign currency|forex)\b/i
        .test([benefit.name, benefit.description, benefit.conditions, benefit.sourceQuote].filter(Boolean).join(" "))
    );
    const hasTaxNote = feeBenefits.some(benefit => /tax(?:es)?/i.test([benefit.description, benefit.conditions, benefit.sourceQuote].filter(Boolean).join(" ")));
    const joiningFeeLabel = card.joiningFee == null
      ? "Not separately recorded"
      : C.formatINR(card.joiningFee) + (hasTaxNote ? " + applicable taxes" : "");
    const annualFeeLabel = card.annualFee == null
      ? "Not specified"
      : C.formatINR(card.annualFee) + (hasTaxNote ? " + applicable taxes" : "");
    let html = sectionIntro("Joining fee, annual fee and waiver conditions recorded for this card.", "Fee summary");
    html += '<div class="modal-fee-grid">' +
      '<article class="modal-fee-card"><span>Annual fee</span><strong>' + escape(annualFeeLabel) + '</strong></article>' +
      '<article class="modal-fee-card"><span>Joining fee</span><strong>' + escape(joiningFeeLabel) + '</strong></article>' +
      '</div>';
    html += '<article class="modal-info-item modal-fee-waiver"><h3>Annual fee waiver</h3>' +
      (card.annualFeeWaiver ? '<p>' + escape(card.annualFeeWaiver) + '</p>' : '<p>No annual-fee waiver details have been recorded. Check the official terms.</p>') +
      sourceLink({ sourceUrl: card.officialUrl }, card) + '</article>';
    html += '<h3 class="modal-subsection-title">Other fee-related terms</h3>';
    if (!feeBenefits.length) {
      html += '<p class="modal-muted-note">No other fee-related details have been recorded separately. Joining fees, foreign-currency markup, late-payment charges and taxes may still apply under issuer terms.</p>';
    } else {
      html += '<div class="modal-item-list">';
      html += feeBenefits.map(benefit =>
        '<article class="modal-info-item"><h3>' + escape(benefit.name || "Fee-related benefit") + '</h3>' +
        '<p>' + escape(benefit.description || "") + '</p>' +
        (benefit.conditions ? '<div class="modal-detail-line"><strong>Conditions</strong><span>' + escape(benefit.conditions) + '</span></div>' : '') +
        (benefit.sourceQuote ? '<blockquote class="modal-source-quote"><strong>Issuer quote</strong><br>“' + escape(benefit.sourceQuote) + '”</blockquote>' : '') +
        sourceLink(benefit, card) + '</article>'
      ).join("");
      html += '</div>';
    }
    html += '<p class="modal-muted-note">A missing fee value means it has not been recorded in this catalogue; it does not mean the fee is zero.</p>';
    return html;
  }

  function renderTab(card, tab) {
    switch (tab) {
      case "rules": return renderRules(card);
      case "restrictions": return renderRestrictions(card);
      case "fees": return renderFees(card);
      default: return renderBenefits(card);
    }
  }

  window.CRI_CARD_MODAL = { renderTab, renderBenefits, renderRules, renderRestrictions, renderFees };
})();
