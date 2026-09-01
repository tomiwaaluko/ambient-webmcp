// GENERATED FILE - DO NOT EDIT.
// Copied verbatim from src/shared/ by scripts/sync-sites.mjs.
// Edit the source in src/shared/ and re-run: node scripts/sync-sites.mjs
/**
 * Skeletal federation inspector — PRO-16 replaces this with full lifecycle UI.
 *
 * One row per origin, state `active` only.
 */

/**
 * @param {HTMLElement} container
 * @param {Array<{ origin: string, state: string, tools?: string[] }>} rows
 */
export function renderInspector(container, rows) {
  container.replaceChildren();

  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'inspector-empty';
    empty.textContent = 'No federated origins yet.';
    container.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'inspector-table';

  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Origin</th><th>State</th><th>Tools</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.dataset.origin = row.origin;

    const originCell = document.createElement('td');
    originCell.textContent = row.origin;

    const stateCell = document.createElement('td');
    stateCell.textContent = row.state;
    stateCell.dataset.state = row.state;

    const toolsCell = document.createElement('td');
    toolsCell.textContent = (row.tools ?? []).join(', ') || '—';

    tr.append(originCell, stateCell, toolsCell);
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  container.appendChild(table);
}
