// Four alternate versions of the strategy with one parameter changed each.
// We propose these deterministically based on the strategy shape — that's
// actually more useful than asking the model, because the shape of the
// strategy tells us which parameters are interesting to perturb.

export function proposeCounterfactuals(parsed) {
  const out = [];

  // 1. Frequency swap
  const entry = parsed.entry_conditions?.[0];
  if (entry?.type === 'scheduled') {
    const cur = entry.logic?.frequency;
    if (cur === 'monthly') {
      out.push(makeVariant(parsed, 'what if you used weekly instead', (p) => {
        p.entry_conditions[0].logic.frequency = 'weekly';
      }));
    } else if (cur === 'weekly') {
      out.push(makeVariant(parsed, 'what if you used monthly instead', (p) => {
        p.entry_conditions[0].logic.frequency = 'monthly';
      }));
    } else if (cur === 'quarterly') {
      out.push(makeVariant(parsed, 'what if you rebalanced monthly', (p) => {
        p.entry_conditions[0].logic.frequency = 'monthly';
        p.rebalance = 'monthly';
      }));
    } else {
      out.push(makeVariant(parsed, 'what if you used weekly instead', (p) => {
        p.entry_conditions[0].logic.frequency = 'weekly';
      }));
    }
  }

  // 2. Position size
  if (parsed.position_sizing?.type === 'fixed_amount') {
    const amt = parsed.position_sizing.spec;
    out.push(makeVariant(parsed, `what if you doubled position size to £${amt * 2}`, (p) => {
      p.position_sizing.spec = amt * 2;
    }));
  } else if (parsed.position_sizing?.type === 'percent_portfolio') {
    const current = parsed.position_sizing.spec;
    const next = Math.min(100, current * 1.5);
    out.push(makeVariant(parsed, `what if you sized positions at ${next}% of portfolio`, (p) => {
      p.position_sizing.spec = next;
    }));
  }

  // 3. Stop loss add/remove
  if (!parsed.risk_management?.stop_loss) {
    out.push(makeVariant(parsed, 'what if you added a 10% stop loss', (p) => {
      p.risk_management.stop_loss = 10;
    }));
  } else {
    out.push(makeVariant(parsed, 'what if you removed the stop loss', (p) => {
      p.risk_management.stop_loss = null;
    }));
  }

  // 4. Asset swap — only for single-asset strategies
  if (parsed.universe?.type === 'single_asset') {
    const cur = (parsed.universe.spec[0] || '').toUpperCase();
    const swap = {
      VUAG: 'VWCE',
      VWCE: 'VUAG',
      VUSA: 'IWDA',
      IWDA: 'VUSA',
      SPY: 'QQQ',
      QQQ: 'SPY',
    }[cur] || 'VWCE';
    out.push(makeVariant(parsed, `what if you used ${swap} instead`, (p) => {
      p.universe.spec = [swap];
      p.benchmark = swap;
    }));
  } else if (parsed.universe?.type === 'list') {
    out.push(makeVariant(parsed, 'what if you added TLT as a bond hedge', (p) => {
      const set = new Set(p.universe.spec.concat(['TLT']));
      p.universe.spec = Array.from(set);
    }));
  } else {
    out.push(makeVariant(parsed, 'what if you picked the top 3 instead of bottom 3', (p) => {
      if (p.universe?.spec) {
        p.universe.spec.select = p.universe.spec.select === 'worst_n' ? 'best_n' : 'worst_n';
      }
    }));
  }

  return out.slice(0, 4);
}

function makeVariant(parsed, name, mutator) {
  const clone = JSON.parse(JSON.stringify(parsed));
  mutator(clone);
  return { name, parsed: clone };
}
