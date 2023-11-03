'use strict';
let sdoBox = {
  init() {
    this.$alternativeId = null;
    this.$outer = document.createElement('div');
    this.$outer.classList.add('toolbox-container');
    this.$container = document.createElement('div');
    this.$container.classList.add('toolbox');
    this.$displayLink = document.createElement('a');
    this.$displayLink.setAttribute('href', '#');
    this.$displayLink.textContent = 'Syntax-Directed Operations';
    this.$displayLink.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      referencePane.showSDOs(sdoMap[this.$alternativeId] || {}, this.$alternativeId);
    });
    this.$container.appendChild(this.$displayLink);
    this.$outer.appendChild(this.$container);
    document.body.appendChild(this.$outer);
  },

  activate(el) {
    clearTimeout(this.deactiveTimeout);
    Toolbox.deactivate();
    this.$alternativeId = el.id;
    let numSdos = Object.keys(sdoMap[this.$alternativeId] || {}).length;
    this.$displayLink.textContent = 'Syntax-Directed Operations (' + numSdos + ')';
    this.$outer.classList.add('active');
    let top = el.offsetTop - this.$outer.offsetHeight;
    let left = el.offsetLeft + 50 - 10; // 50px = padding-left(=75px) + text-indent(=-25px)
    this.$outer.setAttribute('style', 'left: ' + left + 'px; top: ' + top + 'px');
    if (top < document.body.scrollTop) {
      this.$container.scrollIntoView();
    }
  },

  deactivate() {
    clearTimeout(this.deactiveTimeout);
    this.$outer.classList.remove('active');
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof sdoMap == 'undefined') {
    console.error('could not find sdo map');
    return;
  }
  sdoBox.init();

  let insideTooltip = false;
  sdoBox.$outer.addEventListener('pointerenter', () => {
    insideTooltip = true;
  });
  sdoBox.$outer.addEventListener('pointerleave', () => {
    insideTooltip = false;
    sdoBox.deactivate();
  });

  sdoBox.deactiveTimeout = null;
  [].forEach.call(document.querySelectorAll('emu-grammar[type=definition] emu-rhs'), node => {
    node.addEventListener('pointerenter', function () {
      sdoBox.activate(this);
    });

    node.addEventListener('pointerleave', () => {
      sdoBox.deactiveTimeout = setTimeout(() => {
        if (!insideTooltip) {
          sdoBox.deactivate();
        }
      }, 500);
    });
  });

  document.addEventListener(
    'keydown',
    debounce(e => {
      if (e.code === 'Escape') {
        sdoBox.deactivate();
      }
    })
  );
});

'use strict';
function Search(menu) {
  this.menu = menu;
  this.$search = document.getElementById('menu-search');
  this.$searchBox = document.getElementById('menu-search-box');
  this.$searchResults = document.getElementById('menu-search-results');

  this.loadBiblio();

  document.addEventListener('keydown', this.documentKeydown.bind(this));

  this.$searchBox.addEventListener(
    'keydown',
    debounce(this.searchBoxKeydown.bind(this), { stopPropagation: true })
  );
  this.$searchBox.addEventListener(
    'keyup',
    debounce(this.searchBoxKeyup.bind(this), { stopPropagation: true })
  );

  // Perform an initial search if the box is not empty.
  if (this.$searchBox.value) {
    this.search(this.$searchBox.value);
  }
}

Search.prototype.loadBiblio = function () {
  if (typeof biblio === 'undefined') {
    console.error('could not find biblio');
    this.biblio = { refToClause: {}, entries: [] };
  } else {
    this.biblio = biblio;
    this.biblio.clauses = this.biblio.entries.filter(e => e.type === 'clause');
    this.biblio.byId = this.biblio.entries.reduce((map, entry) => {
      map[entry.id] = entry;
      return map;
    }, {});
    let refParentClause = Object.create(null);
    this.biblio.refParentClause = refParentClause;
    let refsByClause = this.biblio.refsByClause;
    Object.keys(refsByClause).forEach(clause => {
      refsByClause[clause].forEach(ref => {
        refParentClause[ref] = clause;
      });
    });
  }
};

Search.prototype.documentKeydown = function (e) {
  if (e.key === '/') {
    e.preventDefault();
    e.stopPropagation();
    this.triggerSearch();
  }
};

Search.prototype.searchBoxKeydown = function (e) {
  e.stopPropagation();
  e.preventDefault();
  if (e.keyCode === 191 && e.target.value.length === 0) {
    e.preventDefault();
  } else if (e.keyCode === 13) {
    e.preventDefault();
    this.selectResult();
  }
};

Search.prototype.searchBoxKeyup = function (e) {
  if (e.keyCode === 13 || e.keyCode === 9) {
    return;
  }

  this.search(e.target.value);
};

Search.prototype.triggerSearch = function () {
  if (this.menu.isVisible()) {
    this._closeAfterSearch = false;
  } else {
    this._closeAfterSearch = true;
    this.menu.show();
  }

  this.$searchBox.focus();
  this.$searchBox.select();
};
// bit 12 - Set if the result starts with searchString
// bits 8-11: 8 - number of chunks multiplied by 2 if cases match, otherwise 1.
// bits 1-7: 127 - length of the entry
// General scheme: prefer case sensitive matches with fewer chunks, and otherwise
// prefer shorter matches.
function relevance(result) {
  let relevance = 0;

  relevance = Math.max(0, 8 - result.match.chunks) << 7;

  if (result.match.caseMatch) {
    relevance *= 2;
  }

  if (result.match.prefix) {
    relevance += 2048;
  }

  relevance += Math.max(0, 255 - result.key.length);

  return relevance;
}

Search.prototype.search = function (searchString) {
  if (searchString === '') {
    this.displayResults([]);
    this.hideSearch();
    return;
  } else {
    this.showSearch();
  }

  if (searchString.length === 1) {
    this.displayResults([]);
    return;
  }

  let results;

  if (/^[\d.]*$/.test(searchString)) {
    results = this.biblio.clauses
      .filter(clause => clause.number.substring(0, searchString.length) === searchString)
      .map(clause => ({ key: getKey(clause), entry: clause }));
  } else {
    results = [];

    for (let i = 0; i < this.biblio.entries.length; i++) {
      let entry = this.biblio.entries[i];
      let key = getKey(entry);
      if (!key) {
        // biblio entries without a key aren't searchable
        continue;
      }

      let match = fuzzysearch(searchString, key);
      if (match) {
        results.push({ key, entry, match });
      }
    }

    results.forEach(result => {
      result.relevance = relevance(result, searchString);
    });

    results = results.sort((a, b) => b.relevance - a.relevance);
  }

  if (results.length > 50) {
    results = results.slice(0, 50);
  }

  this.displayResults(results);
};
Search.prototype.hideSearch = function () {
  this.$search.classList.remove('active');
};

Search.prototype.showSearch = function () {
  this.$search.classList.add('active');
};

Search.prototype.selectResult = function () {
  let $first = this.$searchResults.querySelector('li:first-child a');

  if ($first) {
    document.location = $first.getAttribute('href');
  }

  this.$searchBox.value = '';
  this.$searchBox.blur();
  this.displayResults([]);
  this.hideSearch();

  if (this._closeAfterSearch) {
    this.menu.hide();
  }
};

Search.prototype.displayResults = function (results) {
  if (results.length > 0) {
    this.$searchResults.classList.remove('no-results');

    let html = '<ul>';

    results.forEach(result => {
      let key = result.key;
      let entry = result.entry;
      let id = entry.id;
      let cssClass = '';
      let text = '';

      if (entry.type === 'clause') {
        let number = entry.number ? entry.number + ' ' : '';
        text = number + key;
        cssClass = 'clause';
        id = entry.id;
      } else if (entry.type === 'production') {
        text = key;
        cssClass = 'prod';
        id = entry.id;
      } else if (entry.type === 'op') {
        text = key;
        cssClass = 'op';
        id = entry.id || entry.refId;
      } else if (entry.type === 'term') {
        text = key;
        cssClass = 'term';
        id = entry.id || entry.refId;
      }

      if (text) {
        // prettier-ignore
        html += `<li class=menu-search-result-${cssClass}><a href="${makeLinkToId(id)}">${text}</a></li>`;
      }
    });

    html += '</ul>';

    this.$searchResults.innerHTML = html;
  } else {
    this.$searchResults.innerHTML = '';
    this.$searchResults.classList.add('no-results');
  }
};

function getKey(item) {
  if (item.key) {
    return item.key;
  }
  switch (item.type) {
    case 'clause':
      return item.title || item.titleHTML;
    case 'production':
      return item.name;
    case 'op':
      return item.aoid;
    case 'term':
      return item.term;
    case 'table':
    case 'figure':
    case 'example':
    case 'note':
      return item.caption;
    case 'step':
      return item.id;
    default:
      throw new Error("Can't get key for " + item.type);
  }
}

function Menu() {
  this.$toggle = document.getElementById('menu-toggle');
  this.$menu = document.getElementById('menu');
  this.$toc = document.querySelector('menu-toc > ol');
  this.$pins = document.querySelector('#menu-pins');
  this.$pinList = document.getElementById('menu-pins-list');
  this.$toc = document.querySelector('#menu-toc > ol');
  this.$specContainer = document.getElementById('spec-container');
  this.search = new Search(this);

  this._pinnedIds = {};
  this.loadPinEntries();

  // toggle menu
  this.$toggle.addEventListener('click', this.toggle.bind(this));

  // keydown events for pinned clauses
  document.addEventListener('keydown', this.documentKeydown.bind(this));

  // toc expansion
  let tocItems = this.$menu.querySelectorAll('#menu-toc li');
  for (let i = 0; i < tocItems.length; i++) {
    let $item = tocItems[i];
    $item.addEventListener('click', event => {
      $item.classList.toggle('active');
      event.stopPropagation();
    });
  }

  // close toc on toc item selection
  let tocLinks = this.$menu.querySelectorAll('#menu-toc li > a');
  for (let i = 0; i < tocLinks.length; i++) {
    let $link = tocLinks[i];
    $link.addEventListener('click', event => {
      this.toggle();
      event.stopPropagation();
    });
  }

  // update active clause on scroll
  window.addEventListener('scroll', debounce(this.updateActiveClause.bind(this)));
  this.updateActiveClause();

  // prevent menu scrolling from scrolling the body
  this.$toc.addEventListener('wheel', e => {
    let target = e.currentTarget;
    let offTop = e.deltaY < 0 && target.scrollTop === 0;
    if (offTop) {
      e.preventDefault();
    }
    let offBottom = e.deltaY > 0 && target.offsetHeight + target.scrollTop >= target.scrollHeight;

    if (offBottom) {
      e.preventDefault();
    }
  });
}

Menu.prototype.documentKeydown = function (e) {
  e.stopPropagation();
  if (e.keyCode === 80) {
    this.togglePinEntry();
  } else if (e.keyCode > 48 && e.keyCode < 58) {
    this.selectPin(e.keyCode - 49);
  }
};

Menu.prototype.updateActiveClause = function () {
  this.setActiveClause(findActiveClause(this.$specContainer));
};

Menu.prototype.setActiveClause = function (clause) {
  this.$activeClause = clause;
  this.revealInToc(this.$activeClause);
};

Menu.prototype.revealInToc = function (path) {
  let current = this.$toc.querySelectorAll('li.revealed');
  for (let i = 0; i < current.length; i++) {
    current[i].classList.remove('revealed');
    current[i].classList.remove('revealed-leaf');
  }

  current = this.$toc;
  let index = 0;
  outer: while (index < path.length) {
    let children = current.children;
    for (let i = 0; i < children.length; i++) {
      if ('#' + path[index].id === children[i].children[1].hash) {
        children[i].classList.add('revealed');
        if (index === path.length - 1) {
          children[i].classList.add('revealed-leaf');
          let rect = children[i].getBoundingClientRect();
          // this.$toc.getBoundingClientRect().top;
          let tocRect = this.$toc.getBoundingClientRect();
          if (rect.top + 10 > tocRect.bottom) {
            this.$toc.scrollTop =
              this.$toc.scrollTop + (rect.top - tocRect.bottom) + (rect.bottom - rect.top);
          } else if (rect.top < tocRect.top) {
            this.$toc.scrollTop = this.$toc.scrollTop - (tocRect.top - rect.top);
          }
        }
        current = children[i].querySelector('ol');
        index++;
        continue outer;
      }
    }
    console.log('could not find location in table of contents', path);
    break;
  }
};

function findActiveClause(root, path) {
  path = path || [];

  let visibleClauses = getVisibleClauses(root, path);
  let midpoint = Math.floor(window.innerHeight / 2);

  for (let [$clause, path] of visibleClauses) {
    let { top: clauseTop, bottom: clauseBottom } = $clause.getBoundingClientRect();
    let isFullyVisibleAboveTheFold =
      clauseTop > 0 && clauseTop < midpoint && clauseBottom < window.innerHeight;
    if (isFullyVisibleAboveTheFold) {
      return path;
    }
  }

  visibleClauses.sort(([, pathA], [, pathB]) => pathB.length - pathA.length);
  for (let [$clause, path] of visibleClauses) {
    let { top: clauseTop, bottom: clauseBottom } = $clause.getBoundingClientRect();
    let $header = $clause.querySelector('h1');
    let clauseStyles = getComputedStyle($clause);
    let marginTop = Math.max(
      0,
      parseInt(clauseStyles['margin-top']),
      parseInt(getComputedStyle($header)['margin-top'])
    );
    let marginBottom = Math.max(0, parseInt(clauseStyles['margin-bottom']));
    let crossesMidpoint =
      clauseTop - marginTop <= midpoint && clauseBottom + marginBottom >= midpoint;
    if (crossesMidpoint) {
      return path;
    }
  }

  return path;
}

function getVisibleClauses(root, path) {
  let childClauses = getChildClauses(root);
  path = path || [];

  let result = [];

  let seenVisibleClause = false;
  for (let $clause of childClauses) {
    let { top: clauseTop, bottom: clauseBottom } = $clause.getBoundingClientRect();
    let isPartiallyVisible =
      (clauseTop > 0 && clauseTop < window.innerHeight) ||
      (clauseBottom > 0 && clauseBottom < window.innerHeight) ||
      (clauseTop < 0 && clauseBottom > window.innerHeight);

    if (isPartiallyVisible) {
      seenVisibleClause = true;
      let innerPath = path.concat($clause);
      result.push([$clause, innerPath]);
      result.push(...getVisibleClauses($clause, innerPath));
    } else if (seenVisibleClause) {
      break;
    }
  }

  return result;
}

function* getChildClauses(root) {
  for (let el of root.children) {
    switch (el.nodeName) {
      // descend into <emu-import>
      case 'EMU-IMPORT':
        yield* getChildClauses(el);
        break;

      // accept <emu-clause>, <emu-intro>, and <emu-annex>
      case 'EMU-CLAUSE':
      case 'EMU-INTRO':
      case 'EMU-ANNEX':
        yield el;
    }
  }
}

Menu.prototype.toggle = function () {
  this.$menu.classList.toggle('active');
};

Menu.prototype.show = function () {
  this.$menu.classList.add('active');
};

Menu.prototype.hide = function () {
  this.$menu.classList.remove('active');
};

Menu.prototype.isVisible = function () {
  return this.$menu.classList.contains('active');
};

Menu.prototype.showPins = function () {
  this.$pins.classList.add('active');
};

Menu.prototype.hidePins = function () {
  this.$pins.classList.remove('active');
};

Menu.prototype.addPinEntry = function (id) {
  let entry = this.search.biblio.byId[id];
  if (!entry) {
    // id was deleted after pin (or something) so remove it
    delete this._pinnedIds[id];
    this.persistPinEntries();
    return;
  }

  if (entry.type === 'clause') {
    let prefix;
    if (entry.number) {
      prefix = entry.number + ' ';
    } else {
      prefix = '';
    }
    // prettier-ignore
    this.$pinList.innerHTML += `<li><a href="${makeLinkToId(entry.id)}">${prefix}${entry.titleHTML}</a></li>`;
  } else {
    this.$pinList.innerHTML += `<li><a href="${makeLinkToId(entry.id)}">${getKey(entry)}</a></li>`;
  }

  if (Object.keys(this._pinnedIds).length === 0) {
    this.showPins();
  }
  this._pinnedIds[id] = true;
  this.persistPinEntries();
};

Menu.prototype.removePinEntry = function (id) {
  let item = this.$pinList.querySelector(`a[href="${makeLinkToId(id)}"]`).parentNode;
  this.$pinList.removeChild(item);
  delete this._pinnedIds[id];
  if (Object.keys(this._pinnedIds).length === 0) {
    this.hidePins();
  }

  this.persistPinEntries();
};

Menu.prototype.persistPinEntries = function () {
  try {
    if (!window.localStorage) return;
  } catch (e) {
    return;
  }

  localStorage.pinEntries = JSON.stringify(Object.keys(this._pinnedIds));
};

Menu.prototype.loadPinEntries = function () {
  try {
    if (!window.localStorage) return;
  } catch (e) {
    return;
  }

  let pinsString = window.localStorage.pinEntries;
  if (!pinsString) return;
  let pins = JSON.parse(pinsString);
  for (let i = 0; i < pins.length; i++) {
    this.addPinEntry(pins[i]);
  }
};

Menu.prototype.togglePinEntry = function (id) {
  if (!id) {
    id = this.$activeClause[this.$activeClause.length - 1].id;
  }

  if (this._pinnedIds[id]) {
    this.removePinEntry(id);
  } else {
    this.addPinEntry(id);
  }
};

Menu.prototype.selectPin = function (num) {
  document.location = this.$pinList.children[num].children[0].href;
};

let menu;

document.addEventListener('DOMContentLoaded', init);

function debounce(fn, opts) {
  opts = opts || {};
  let timeout;
  return function (e) {
    if (opts.stopPropagation) {
      e.stopPropagation();
    }
    let args = arguments;
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = null;
      fn.apply(this, args);
    }, 150);
  };
}

let CLAUSE_NODES = ['EMU-CLAUSE', 'EMU-INTRO', 'EMU-ANNEX'];
function findContainer($elem) {
  let parentClause = $elem.parentNode;
  while (parentClause && CLAUSE_NODES.indexOf(parentClause.nodeName) === -1) {
    parentClause = parentClause.parentNode;
  }
  return parentClause;
}

function findLocalReferences(parentClause, name) {
  let vars = parentClause.querySelectorAll('var');
  let references = [];

  for (let i = 0; i < vars.length; i++) {
    let $var = vars[i];

    if ($var.innerHTML === name) {
      references.push($var);
    }
  }

  return references;
}

let REFERENCED_CLASSES = Array.from({ length: 7 }, (x, i) => `referenced${i}`);
function chooseHighlightIndex(parentClause) {
  let counts = REFERENCED_CLASSES.map($class => parentClause.getElementsByClassName($class).length);
  // Find the earliest index with the lowest count.
  let minCount = Infinity;
  let index = null;
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] < minCount) {
      minCount = counts[i];
      index = i;
    }
  }
  return index;
}

function toggleFindLocalReferences($elem) {
  let parentClause = findContainer($elem);
  let references = findLocalReferences(parentClause, $elem.innerHTML);
  if ($elem.classList.contains('referenced')) {
    references.forEach($reference => {
      $reference.classList.remove('referenced', ...REFERENCED_CLASSES);
    });
  } else {
    let index = chooseHighlightIndex(parentClause);
    references.forEach($reference => {
      $reference.classList.add('referenced', `referenced${index}`);
    });
  }
}

function installFindLocalReferences() {
  document.addEventListener('click', e => {
    if (e.target.nodeName === 'VAR') {
      toggleFindLocalReferences(e.target);
    }
  });
}

document.addEventListener('DOMContentLoaded', installFindLocalReferences);

// The following license applies to the fuzzysearch function
// The MIT License (MIT)
// Copyright © 2015 Nicolas Bevacqua
// Copyright © 2016 Brian Terlson
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
// FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
// IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
function fuzzysearch(searchString, haystack, caseInsensitive) {
  let tlen = haystack.length;
  let qlen = searchString.length;
  let chunks = 1;
  let finding = false;

  if (qlen > tlen) {
    return false;
  }

  if (qlen === tlen) {
    if (searchString === haystack) {
      return { caseMatch: true, chunks: 1, prefix: true };
    } else if (searchString.toLowerCase() === haystack.toLowerCase()) {
      return { caseMatch: false, chunks: 1, prefix: true };
    } else {
      return false;
    }
  }

  let j = 0;
  outer: for (let i = 0; i < qlen; i++) {
    let nch = searchString[i];
    while (j < tlen) {
      let targetChar = haystack[j++];
      if (targetChar === nch) {
        finding = true;
        continue outer;
      }
      if (finding) {
        chunks++;
        finding = false;
      }
    }

    if (caseInsensitive) {
      return false;
    }

    return fuzzysearch(searchString.toLowerCase(), haystack.toLowerCase(), true);
  }

  return { caseMatch: !caseInsensitive, chunks, prefix: j <= qlen };
}

let referencePane = {
  init() {
    this.$container = document.createElement('div');
    this.$container.setAttribute('id', 'references-pane-container');

    let $spacer = document.createElement('div');
    $spacer.setAttribute('id', 'references-pane-spacer');
    $spacer.classList.add('menu-spacer');

    this.$pane = document.createElement('div');
    this.$pane.setAttribute('id', 'references-pane');

    this.$container.appendChild($spacer);
    this.$container.appendChild(this.$pane);

    this.$header = document.createElement('div');
    this.$header.classList.add('menu-pane-header');
    this.$headerText = document.createElement('span');
    this.$header.appendChild(this.$headerText);
    this.$headerRefId = document.createElement('a');
    this.$header.appendChild(this.$headerRefId);
    this.$header.addEventListener('pointerdown', e => {
      this.dragStart(e);
    });

    this.$closeButton = document.createElement('span');
    this.$closeButton.setAttribute('id', 'references-pane-close');
    this.$closeButton.addEventListener('click', () => {
      this.deactivate();
    });
    this.$header.appendChild(this.$closeButton);

    this.$pane.appendChild(this.$header);
    this.$tableContainer = document.createElement('div');
    this.$tableContainer.setAttribute('id', 'references-pane-table-container');

    this.$table = document.createElement('table');
    this.$table.setAttribute('id', 'references-pane-table');

    this.$tableBody = this.$table.createTBody();

    this.$tableContainer.appendChild(this.$table);
    this.$pane.appendChild(this.$tableContainer);

    menu.$specContainer.appendChild(this.$container);
  },

  activate() {
    this.$container.classList.add('active');
  },

  deactivate() {
    this.$container.classList.remove('active');
    this.state = null;
  },

  showReferencesFor(entry) {
    this.activate();
    this.state = { type: 'ref', id: entry.id };
    this.$headerText.textContent = 'References to ';
    let newBody = document.createElement('tbody');
    let previousId;
    let previousCell;
    let dupCount = 0;
    this.$headerRefId.innerHTML = getKey(entry);
    this.$headerRefId.setAttribute('href', makeLinkToId(entry.id));
    this.$headerRefId.style.display = 'inline';
    (entry.referencingIds || [])
      .map(id => {
        let cid = menu.search.biblio.refParentClause[id];
        let clause = menu.search.biblio.byId[cid];
        if (clause == null) {
          throw new Error('could not find clause for id ' + cid);
        }
        return { id, clause };
      })
      .sort((a, b) => sortByClauseNumber(a.clause, b.clause))
      .forEach(record => {
        if (previousId === record.clause.id) {
          previousCell.innerHTML += ` (<a href="${makeLinkToId(record.id)}">${dupCount + 2}</a>)`;
          dupCount++;
        } else {
          let row = newBody.insertRow();
          let cell = row.insertCell();
          cell.innerHTML = record.clause.number;
          cell = row.insertCell();
          cell.innerHTML = `<a href="${makeLinkToId(record.id)}">${record.clause.titleHTML}</a>`;
          previousCell = cell;
          previousId = record.clause.id;
          dupCount = 0;
        }
      }, this);
    this.$table.removeChild(this.$tableBody);
    this.$tableBody = newBody;
    this.$table.appendChild(this.$tableBody);
    this.autoSize();
  },

  showSDOs(sdos, alternativeId) {
    let rhs = document.getElementById(alternativeId);
    let parentName = rhs.parentNode.getAttribute('name');
    let colons = rhs.parentNode.querySelector('emu-geq');
    rhs = rhs.cloneNode(true);
    rhs.querySelectorAll('emu-params,emu-constraints').forEach(e => {
      e.remove();
    });
    rhs.querySelectorAll('[id]').forEach(e => {
      e.removeAttribute('id');
    });
    rhs.querySelectorAll('a').forEach(e => {
      e.parentNode.replaceChild(document.createTextNode(e.textContent), e);
    });

    // prettier-ignore
    this.$headerText.innerHTML = `Syntax-Directed Operations for<br><a href="${makeLinkToId(alternativeId)}" class="menu-pane-header-production"><emu-nt>${parentName}</emu-nt> ${colons.outerHTML} </a>`;
    this.$headerText.querySelector('a').append(rhs);
    this.showSDOsBody(sdos, alternativeId);
  },

  showSDOsBody(sdos, alternativeId) {
    this.activate();
    this.state = { type: 'sdo', id: alternativeId, html: this.$headerText.innerHTML };
    this.$headerRefId.style.display = 'none';
    let newBody = document.createElement('tbody');
    Object.keys(sdos).forEach(sdoName => {
      let pair = sdos[sdoName];
      let clause = pair.clause;
      let ids = pair.ids;
      let first = ids[0];
      let row = newBody.insertRow();
      let cell = row.insertCell();
      cell.innerHTML = clause;
      cell = row.insertCell();
      let html = '<a href="' + makeLinkToId(first) + '">' + sdoName + '</a>';
      for (let i = 1; i < ids.length; ++i) {
        html += ' (<a href="' + makeLinkToId(ids[i]) + '">' + (i + 1) + '</a>)';
      }
      cell.innerHTML = html;
    });
    this.$table.removeChild(this.$tableBody);
    this.$tableBody = newBody;
    this.$table.appendChild(this.$tableBody);
    this.autoSize();
  },

  autoSize() {
    this.$tableContainer.style.height =
      Math.min(250, this.$table.getBoundingClientRect().height) + 'px';
  },

  dragStart(pointerDownEvent) {
    let startingMousePos = pointerDownEvent.clientY;
    let startingHeight = this.$tableContainer.getBoundingClientRect().height;
    let moveListener = pointerMoveEvent => {
      if (pointerMoveEvent.buttons === 0) {
        removeListeners();
        return;
      }
      let desiredHeight = startingHeight - (pointerMoveEvent.clientY - startingMousePos);
      this.$tableContainer.style.height = Math.max(0, desiredHeight) + 'px';
    };
    let listenerOptions = { capture: true, passive: true };
    let removeListeners = () => {
      document.removeEventListener('pointermove', moveListener, listenerOptions);
      this.$header.removeEventListener('pointerup', removeListeners, listenerOptions);
      this.$header.removeEventListener('pointercancel', removeListeners, listenerOptions);
    };
    document.addEventListener('pointermove', moveListener, listenerOptions);
    this.$header.addEventListener('pointerup', removeListeners, listenerOptions);
    this.$header.addEventListener('pointercancel', removeListeners, listenerOptions);
  },
};

let Toolbox = {
  init() {
    this.$outer = document.createElement('div');
    this.$outer.classList.add('toolbox-container');
    this.$container = document.createElement('div');
    this.$container.classList.add('toolbox');
    this.$outer.appendChild(this.$container);
    this.$permalink = document.createElement('a');
    this.$permalink.textContent = 'Permalink';
    this.$pinLink = document.createElement('a');
    this.$pinLink.textContent = 'Pin';
    this.$pinLink.setAttribute('href', '#');
    this.$pinLink.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      menu.togglePinEntry(this.entry.id);
      this.$pinLink.textContent = menu._pinnedIds[this.entry.id] ? 'Unpin' : 'Pin';
    });

    this.$refsLink = document.createElement('a');
    this.$refsLink.setAttribute('href', '#');
    this.$refsLink.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      referencePane.showReferencesFor(this.entry);
    });
    this.$container.appendChild(this.$permalink);
    this.$container.appendChild(document.createTextNode(' '));
    this.$container.appendChild(this.$pinLink);
    this.$container.appendChild(document.createTextNode(' '));
    this.$container.appendChild(this.$refsLink);
    document.body.appendChild(this.$outer);
  },

  activate(el, entry, target) {
    if (el === this._activeEl) return;
    sdoBox.deactivate();
    this.active = true;
    this.entry = entry;
    this.$pinLink.textContent = menu._pinnedIds[entry.id] ? 'Unpin' : 'Pin';
    this.$outer.classList.add('active');
    this.top = el.offsetTop - this.$outer.offsetHeight;
    this.left = el.offsetLeft - 10;
    this.$outer.setAttribute('style', 'left: ' + this.left + 'px; top: ' + this.top + 'px');
    this.updatePermalink();
    this.updateReferences();
    this._activeEl = el;
    if (this.top < document.body.scrollTop && el === target) {
      // don't scroll unless it's a small thing (< 200px)
      this.$outer.scrollIntoView();
    }
  },

  updatePermalink() {
    this.$permalink.setAttribute('href', makeLinkToId(this.entry.id));
  },

  updateReferences() {
    this.$refsLink.textContent = `References (${(this.entry.referencingIds || []).length})`;
  },

  activateIfMouseOver(e) {
    let ref = this.findReferenceUnder(e.target);
    if (ref && (!this.active || e.pageY > this._activeEl.offsetTop)) {
      let entry = menu.search.biblio.byId[ref.id];
      this.activate(ref.element, entry, e.target);
    } else if (
      this.active &&
      (e.pageY < this.top || e.pageY > this._activeEl.offsetTop + this._activeEl.offsetHeight)
    ) {
      this.deactivate();
    }
  },

  findReferenceUnder(el) {
    while (el) {
      let parent = el.parentNode;
      if (el.nodeName === 'EMU-RHS' || el.nodeName === 'EMU-PRODUCTION') {
        return null;
      }
      if (
        el.nodeName === 'H1' &&
        parent.nodeName.match(/EMU-CLAUSE|EMU-ANNEX|EMU-INTRO/) &&
        parent.id
      ) {
        return { element: el, id: parent.id };
      } else if (el.nodeName === 'EMU-NT') {
        if (
          parent.nodeName === 'EMU-PRODUCTION' &&
          parent.id &&
          parent.id[0] !== '_' &&
          parent.firstElementChild === el
        ) {
          // return the LHS non-terminal element
          return { element: el, id: parent.id };
        }
        return null;
      } else if (
        el.nodeName.match(/EMU-(?!CLAUSE|XREF|ANNEX|INTRO)|DFN/) &&
        el.id &&
        el.id[0] !== '_'
      ) {
        if (
          el.nodeName === 'EMU-FIGURE' ||
          el.nodeName === 'EMU-TABLE' ||
          el.nodeName === 'EMU-EXAMPLE'
        ) {
          // return the figcaption element
          return { element: el.children[0].children[0], id: el.id };
        } else {
          return { element: el, id: el.id };
        }
      }
      el = parent;
    }
  },

  deactivate() {
    this.$outer.classList.remove('active');
    this._activeEl = null;
    this.active = false;
  },
};

function sortByClauseNumber(clause1, clause2) {
  let c1c = clause1.number.split('.');
  let c2c = clause2.number.split('.');

  for (let i = 0; i < c1c.length; i++) {
    if (i >= c2c.length) {
      return 1;
    }

    let c1 = c1c[i];
    let c2 = c2c[i];
    let c1cn = Number(c1);
    let c2cn = Number(c2);

    if (Number.isNaN(c1cn) && Number.isNaN(c2cn)) {
      if (c1 > c2) {
        return 1;
      } else if (c1 < c2) {
        return -1;
      }
    } else if (!Number.isNaN(c1cn) && Number.isNaN(c2cn)) {
      return -1;
    } else if (Number.isNaN(c1cn) && !Number.isNaN(c2cn)) {
      return 1;
    } else if (c1cn > c2cn) {
      return 1;
    } else if (c1cn < c2cn) {
      return -1;
    }
  }

  if (c1c.length === c2c.length) {
    return 0;
  }
  return -1;
}

function makeLinkToId(id) {
  let hash = '#' + id;
  if (typeof idToSection === 'undefined' || !idToSection[id]) {
    return hash;
  }
  let targetSec = idToSection[id];
  return (targetSec === 'index' ? './' : targetSec + '.html') + hash;
}

function doShortcut(e) {
  if (!(e.target instanceof HTMLElement)) {
    return;
  }
  let target = e.target;
  let name = target.nodeName.toLowerCase();
  if (name === 'textarea' || name === 'input' || name === 'select' || target.isContentEditable) {
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) {
    return;
  }
  if (e.key === 'm' && usesMultipage) {
    let pathParts = location.pathname.split('/');
    let hash = location.hash;
    if (pathParts[pathParts.length - 2] === 'multipage') {
      if (hash === '') {
        let sectionName = pathParts[pathParts.length - 1];
        if (sectionName.endsWith('.html')) {
          sectionName = sectionName.slice(0, -5);
        }
        if (idToSection['sec-' + sectionName] !== undefined) {
          hash = '#sec-' + sectionName;
        }
      }
      location = pathParts.slice(0, -2).join('/') + '/' + hash;
    } else {
      location = 'multipage/' + hash;
    }
  } else if (e.key === 'u') {
    document.documentElement.classList.toggle('show-ao-annotations');
  } else if (e.key === '?') {
    document.getElementById('shortcuts-help').classList.toggle('active');
  }
}

function init() {
  menu = new Menu();
  let $container = document.getElementById('spec-container');
  $container.addEventListener(
    'mouseover',
    debounce(e => {
      Toolbox.activateIfMouseOver(e);
    })
  );
  document.addEventListener(
    'keydown',
    debounce(e => {
      if (e.code === 'Escape') {
        if (Toolbox.active) {
          Toolbox.deactivate();
        }
        document.getElementById('shortcuts-help').classList.remove('active');
      }
    })
  );
}

document.addEventListener('keypress', doShortcut);

document.addEventListener('DOMContentLoaded', () => {
  Toolbox.init();
  referencePane.init();
});

// preserve state during navigation

function getTocPath(li) {
  let path = [];
  let pointer = li;
  while (true) {
    let parent = pointer.parentElement;
    if (parent == null) {
      return null;
    }
    let index = [].indexOf.call(parent.children, pointer);
    if (index == -1) {
      return null;
    }
    path.unshift(index);
    pointer = parent.parentElement;
    if (pointer == null) {
      return null;
    }
    if (pointer.id === 'menu-toc') {
      break;
    }
    if (pointer.tagName !== 'LI') {
      return null;
    }
  }
  return path;
}

function activateTocPath(path) {
  try {
    let pointer = document.getElementById('menu-toc');
    for (let index of path) {
      pointer = pointer.querySelector('ol').children[index];
    }
    pointer.classList.add('active');
  } catch (e) {
    // pass
  }
}

function getActiveTocPaths() {
  return [...menu.$menu.querySelectorAll('.active')].map(getTocPath).filter(p => p != null);
}

function initTOCExpansion(visibleItemLimit) {
  // Initialize to a reasonable amount of TOC expansion:
  // * Expand any full-breadth nesting level up to visibleItemLimit.
  // * Expand any *single-item* level while under visibleItemLimit (even if that pushes over it).

  // Limit to initialization by bailing out if any parent item is already expanded.
  const tocItems = Array.from(document.querySelectorAll('#menu-toc li'));
  if (tocItems.some(li => li.classList.contains('active') && li.querySelector('li'))) {
    return;
  }

  const selfAndSiblings = maybe => Array.from(maybe?.parentNode.children ?? []);
  let currentLevelItems = selfAndSiblings(tocItems[0]);
  let availableCount = visibleItemLimit - currentLevelItems.length;
  while (availableCount > 0 && currentLevelItems.length) {
    const nextLevelItems = currentLevelItems.flatMap(li => selfAndSiblings(li.querySelector('li')));
    availableCount -= nextLevelItems.length;
    if (availableCount > 0 || currentLevelItems.length === 1) {
      // Expand parent items of the next level down (i.e., current-level items with children).
      for (const ol of new Set(nextLevelItems.map(li => li.parentNode))) {
        ol.closest('li').classList.add('active');
      }
    }
    currentLevelItems = nextLevelItems;
  }
}

function initState() {
  if (typeof menu === 'undefined' || window.navigating) {
    return;
  }
  const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : Object.create(null);
  if (storage.referencePaneState != null) {
    let state = JSON.parse(storage.referencePaneState);
    if (state != null) {
      if (state.type === 'ref') {
        let entry = menu.search.biblio.byId[state.id];
        if (entry != null) {
          referencePane.showReferencesFor(entry);
        }
      } else if (state.type === 'sdo') {
        let sdos = sdoMap[state.id];
        if (sdos != null) {
          referencePane.$headerText.innerHTML = state.html;
          referencePane.showSDOsBody(sdos, state.id);
        }
      }
      delete storage.referencePaneState;
    }
  }

  if (storage.activeTocPaths != null) {
    document.querySelectorAll('#menu-toc li.active').forEach(li => li.classList.remove('active'));
    let active = JSON.parse(storage.activeTocPaths);
    active.forEach(activateTocPath);
    delete storage.activeTocPaths;
  } else {
    initTOCExpansion(20);
  }

  if (storage.searchValue != null) {
    let value = JSON.parse(storage.searchValue);
    menu.search.$searchBox.value = value;
    menu.search.search(value);
    delete storage.searchValue;
  }

  if (storage.tocScroll != null) {
    let tocScroll = JSON.parse(storage.tocScroll);
    menu.$toc.scrollTop = tocScroll;
    delete storage.tocScroll;
  }
}

document.addEventListener('DOMContentLoaded', initState);

window.addEventListener('pageshow', initState);

window.addEventListener('beforeunload', () => {
  if (!window.sessionStorage || typeof menu === 'undefined') {
    return;
  }
  sessionStorage.referencePaneState = JSON.stringify(referencePane.state || null);
  sessionStorage.activeTocPaths = JSON.stringify(getActiveTocPaths());
  sessionStorage.searchValue = JSON.stringify(menu.search.$searchBox.value);
  sessionStorage.tocScroll = JSON.stringify(menu.$toc.scrollTop);
});

'use strict';

// Manually prefix algorithm step list items with hidden counter representations
// corresponding with their markers so they get selected and copied with content.
// We read list-style-type to avoid divergence with the style sheet, but
// for efficiency assume that all lists at the same nesting depth use the same
// style (except for those associated with replacement steps).
// We also precompute some initial items for each supported style type.
// https://w3c.github.io/csswg-drafts/css-counter-styles/

const lowerLetters = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode('a'.charCodeAt(0) + i)
);
// Implement the lower-alpha 'alphabetic' algorithm,
// adjusting for indexing from 0 rather than 1.
// https://w3c.github.io/csswg-drafts/css-counter-styles/#simple-alphabetic
// https://w3c.github.io/csswg-drafts/css-counter-styles/#alphabetic-system
const lowerAlphaTextForIndex = i => {
  let S = '';
  for (const N = lowerLetters.length; i >= 0; i--) {
    S = lowerLetters[i % N] + S;
    i = Math.floor(i / N);
  }
  return S;
};

const weightedLowerRomanSymbols = Object.entries({
  m: 1000,
  cm: 900,
  d: 500,
  cd: 400,
  c: 100,
  xc: 90,
  l: 50,
  xl: 40,
  x: 10,
  ix: 9,
  v: 5,
  iv: 4,
  i: 1,
});
// Implement the lower-roman 'additive' algorithm,
// adjusting for indexing from 0 rather than 1.
// https://w3c.github.io/csswg-drafts/css-counter-styles/#simple-numeric
// https://w3c.github.io/csswg-drafts/css-counter-styles/#additive-system
const lowerRomanTextForIndex = i => {
  let value = i + 1;
  let S = '';
  for (const [symbol, weight] of weightedLowerRomanSymbols) {
    if (!value) break;
    if (weight > value) continue;
    const reps = Math.floor(value / weight);
    S += symbol.repeat(reps);
    value -= weight * reps;
  }
  return S;
};

// Memoize pure index-to-text functions with an exposed cache for fast retrieval.
const makeCounter = (pureGetTextForIndex, precomputeCount = 30) => {
  const cache = Array.from({ length: precomputeCount }, (_, i) => pureGetTextForIndex(i));
  const getTextForIndex = i => {
    if (i >= cache.length) cache[i] = pureGetTextForIndex(i);
    return cache[i];
  };
  return { getTextForIndex, cache };
};

const counterByStyle = {
  __proto__: null,
  decimal: makeCounter(i => String(i + 1)),
  'lower-alpha': makeCounter(lowerAlphaTextForIndex),
  'upper-alpha': makeCounter(i => lowerAlphaTextForIndex(i).toUpperCase()),
  'lower-roman': makeCounter(lowerRomanTextForIndex),
  'upper-roman': makeCounter(i => lowerRomanTextForIndex(i).toUpperCase()),
};
const fallbackCounter = makeCounter(() => '?');
const counterByDepth = [];

function addStepNumberText(
  ol,
  depth = 0,
  special = [...ol.classList].some(c => c.startsWith('nested-'))
) {
  let counter = !special && counterByDepth[depth];
  if (!counter) {
    const counterStyle = getComputedStyle(ol)['list-style-type'];
    counter = counterByStyle[counterStyle];
    if (!counter) {
      console.warn('unsupported list-style-type', {
        ol,
        counterStyle,
        id: ol.closest('[id]')?.getAttribute('id'),
      });
      counterByStyle[counterStyle] = fallbackCounter;
      counter = fallbackCounter;
    }
    if (!special) {
      counterByDepth[depth] = counter;
    }
  }
  const { cache, getTextForIndex } = counter;
  let i = (Number(ol.getAttribute('start')) || 1) - 1;
  for (const li of ol.children) {
    const marker = document.createElement('span');
    marker.textContent = `${i < cache.length ? cache[i] : getTextForIndex(i)}. `;
    marker.setAttribute('aria-hidden', 'true');
    const attributesContainer = li.querySelector('.attributes-tag');
    if (attributesContainer == null) {
      li.prepend(marker);
    } else {
      attributesContainer.insertAdjacentElement('afterend', marker);
    }
    for (const sublist of li.querySelectorAll(':scope > ol')) {
      addStepNumberText(sublist, depth + 1, special);
    }
    i++;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('emu-alg > ol').forEach(ol => {
    addStepNumberText(ol);
  });
});

'use strict';

// Update superscripts to not suffer misinterpretation when copied and pasted as plain text.
// For example,
// * Replace `10<sup>3</sup>` with
//   `10<span aria-hidden="true">**</span><sup>3</sup>`
//   so it gets pasted as `10**3` rather than `103`.
// * Replace `10<sup>-<var>x</var></sup>` with
//   `10<span aria-hidden="true">**</span><sup>-<var>x</var></sup>`
//   so it gets pasted as `10**-x` rather than `10-x`.
// * Replace `2<sup><var>a</var> + 1</sup>` with
//   `2<span …>**(</span><sup><var>a</var> + 1</sup><span …>)</span>`
//   so it gets pasted as `2**(a + 1)` rather than `2a + 1`.

function makeExponentPlainTextSafe(sup) {
  // Change a <sup> only if it appears to be an exponent:
  // * text-only and contains only mathematical content (not e.g. `1<sup>st</sup>`)
  // * contains only <var>s and internal links (e.g.
  //   `2<sup><emu-xref><a href="#ℝ">ℝ</a></emu-xref>(_y_)</sup>`)
  const isText = [...sup.childNodes].every(node => node.nodeType === 3);
  const text = sup.textContent;
  if (isText) {
    if (!/^[0-9. 𝔽ℝℤ()=*×/÷±+\u2212-]+$/u.test(text)) {
      return;
    }
  } else {
    if (sup.querySelector('*:not(var, emu-xref, :scope emu-xref a)')) {
      return;
    }
  }

  let prefix = '**';
  let suffix = '';

  // Add wrapping parentheses unless they are already present
  // or this is a simple (possibly signed) integer or single-variable exponent.
  const skipParens =
    /^[±+\u2212-]?(?:[0-9]+|\p{ID_Start}\p{ID_Continue}*)$/u.test(text) ||
    // Split on parentheses and remember them; the resulting parts must
    // start and end empty (i.e., with open/close parentheses)
    // and increase depth to 1 only at the first parenthesis
    // to e.g. wrap `(a+1)*(b+1)` but not `((a+1)*(b+1))`.
    text
      .trim()
      .split(/([()])/g)
      .reduce((depth, s, i, parts) => {
        if (s === '(') {
          return depth > 0 || i === 1 ? depth + 1 : NaN;
        } else if (s === ')') {
          return depth > 0 ? depth - 1 : NaN;
        } else if (s === '' || (i > 0 && i < parts.length - 1)) {
          return depth;
        }
        return NaN;
      }, 0) === 0;
  if (!skipParens) {
    prefix += '(';
    suffix += ')';
  }

  sup.insertAdjacentHTML('beforebegin', `<span aria-hidden="true">${prefix}</span>`);
  if (suffix) {
    sup.insertAdjacentHTML('afterend', `<span aria-hidden="true">${suffix}</span>`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('sup:not(.text)').forEach(sup => {
    makeExponentPlainTextSafe(sup);
  });
});

let sdoMap = JSON.parse(`{"prod-wb1qbqF_":{"Static":{"clause":"15.10.2","ids":["prod-I7topxGO"]}},"prod-NtCnMbkE":{"Static":{"clause":"15.10.2","ids":["prod-BxBIqrjb"]},"MatchClausesEvaluation":{"clause":"30.3.2","ids":["prod-Xwb0apYm"]}},"prod-osIogguG":{"Static":{"clause":"15.10.2","ids":["prod-Pvcko0qr"]},"MatchClausesEvaluation":{"clause":"30.3.2","ids":["prod-Qbj6SERB"]}},"prod-dWI3A7__":{"Static":{"clause":"15.10.2","ids":["prod-e6DLPANq"]},"MatchClausesEvaluation":{"clause":"30.3.2","ids":["prod-vIOuobTX"]}},"prod-TyV2nZ8j":{"Static":{"clause":"15.10.2","ids":["prod-Gsr_-xuv"]},"MatchClauseEvaluation":{"clause":"30.3.3","ids":["prod-TlBYUUkU"]}},"prod-Q-aCS0Yx":{"MatchPatternMatches":{"clause":"30.2.1","ids":["prod-A9b_MWQ_"]}},"prod-KUcUUgsn":{"MatchPatternMatches":{"clause":"30.2.1","ids":["prod-U80C8biY"]}},"prod-NnfvhTBM":{"MatchPatternMatches":{"clause":"30.2.1","ids":["prod-6fPS70C2"]}},"prod-Nk3Ek8wq":{"MatchPatternMatches":{"clause":"30.2.1","ids":["prod-jr6yvrk2"]}},"prod-dtu4srcz":{"MatchPatternMatches":{"clause":"30.2.1","ids":["prod-vBMoWeeV"]}},"prod-en0pW04U":{"MatchPatternMatches":{"clause":"30.2.1","ids":["prod-MW-Egi0C"]}},"prod-LetWbF4Q":{"MatchPatternMatches":{"clause":"30.2.1","ids":["prod-E8S1P1H4"]}},"prod-GC1hibKU":{"MatchPatternMatches":{"clause":"30.2.1","ids":["prod-rvZDZ_Jw"]}},"prod-LAj8DpMp":{"MatchPatternMatches":{"clause":"30.2.1","ids":["prod-EquXXU0V"]}},"prod-lZG2aTTb":{"PrimitivePatternMatches":{"clause":"30.2.2","ids":["prod-mlLTmHeP"]}},"prod-rqU7_eLx":{"PrimitivePatternMatches":{"clause":"30.2.2","ids":["prod-eFLzsKUd"]}},"prod-ttS1PbAl":{"RegularExpressionPatternMatches":{"clause":"30.2.3","ids":["prod-P1uLoEwr"]}},"prod-G4gXeSPg":{"MemberExpressionPatternMatches":{"clause":"30.2.4","ids":["prod--tiCo4Kg"]}},"prod-blOttJBG":{"UnaryAlgebraicPatternMatches":{"clause":"30.2.5","ids":["prod-HOehzcwY"]}},"prod-B8ttIyEp":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod-jzgxvYSU"]}},"prod-kaUSkted":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod-9DoLgcnX"]}},"prod-ZKbNGn0S":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod-faS5eSHX"]}},"prod-q7iYGbLj":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod-dZBG0xZ9"]}},"prod-sQz7HIlw":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod-yy5yPHTl"]}},"prod-RXeIzYfk":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod-t92FQRys"]}},"prod--EL6WoUx":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod-jkKYWs5-"]}},"prod-hfUHb1st":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod-H554DQSc"]}},"prod-ZY6njlkT":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod--2WRt1ny"]}},"prod--ORn9FCG":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod-4O2G-jbN"]}},"prod-GVt4mBs8":{"RelationalPatternMatches":{"clause":"30.2.6","ids":["prod-U6M_WT6U"]}},"prod-F0nSIfMB":{"IfPatternMatches":{"clause":"30.2.7","ids":["prod-OcKu_40M"]}},"prod-a_2cW9fV":{"CombinedMatchPatternMatches":{"clause":"30.2.8","ids":["prod-TGrK8XcZ"]}},"prod-BMX8uZDG":{"CombinedMatchPatternMatches":{"clause":"30.2.8","ids":["prod-hYdo8hkU"]}},"prod-4IhLPseH":{"CombinedMatchPatternMatches":{"clause":"30.2.8","ids":["prod-_QtiVeJ1"]}}}`);
let biblio = JSON.parse(`{"refsByClause":{"welcome":["_ref_0","_ref_1","_ref_2","_ref_3"],"sec-primary-expression-match-expression":["_ref_4","_ref_82"],"sec-match-patterns":["_ref_5","_ref_100","_ref_101","_ref_102","_ref_103","_ref_104","_ref_105","_ref_106","_ref_107","_ref_108","_ref_109","_ref_110","_ref_111","_ref_112","_ref_113","_ref_114","_ref_115","_ref_116","_ref_117","_ref_118","_ref_119","_ref_120","_ref_121","_ref_122","_ref_123","_ref_124","_ref_125","_ref_126","_ref_127","_ref_128","_ref_129","_ref_130","_ref_131","_ref_132","_ref_133","_ref_134","_ref_135","_ref_136","_ref_137","_ref_138","_ref_139"],"sec-object-internal-methods-and-internal-slots":["_ref_6"],"sec-relational-operators-runtime-semantics-evaluation":["_ref_7","_ref_84","_ref_85"],"sec-object-@@custommatcher":["_ref_8"],"sec-function-@@custommatcher":["_ref_9"],"sec-function.prototype-@@custommatcher":["_ref_10"],"sec-boolean-@@custommatcher":["_ref_11"],"sec-symbol.custommatcher":["_ref_12"],"sec-symbol-@@custommatcher":["_ref_13","_ref_14","_ref_15"],"sec-error-@@custommatcher":["_ref_16"],"sec-properties-of-error-instances":["_ref_17"],"sec-nativeerror-@@custommatcher":["_ref_18"],"sec-properties-of-nativeerror-instances":["_ref_19"],"sec-aggregate-error-@@custommatcher":["_ref_20"],"sec-properties-of-aggregate-error-instances":["_ref_21"],"sec-number-@@custommatcher":["_ref_22"],"sec-bigint-@@custommatcher":["_ref_23"],"sec-date-@@custommatcher":["_ref_24"],"sec-string-@@custommatcher":["_ref_25"],"sec-regexp-@@custommatcher":["_ref_26","_ref_27"],"sec-regexp.prototype-@@custommatcher":["_ref_28"],"sec-array-@@custommatcher":["_ref_29"],"sec-_typedarray_-@@custommatcher":["_ref_30"],"sec-map-@@custommatcher":["_ref_31"],"sec-set-@@custommatcher":["_ref_32"],"sec-weakmap-@@custommatcher":["_ref_33"],"sec-weakset-@@custommatcher":["_ref_34"],"sec-arraybuffer-@@custommatcher":["_ref_35"],"sec-sharedarraybuffer-@@custommatcher":["_ref_36"],"sec-dataview-@@custommatcher":["_ref_37"],"sec-weakref-@@custommatcher":["_ref_38"],"sec-finalizationregistry-@@custommatcher":["_ref_39"],"sec-promise-@@custommatcher":["_ref_40"],"sec-proxy-constructor":["_ref_41"],"sec-match-pattern-matches":["_ref_42","_ref_43","_ref_44","_ref_45","_ref_46","_ref_47","_ref_48","_ref_49","_ref_50","_ref_151","_ref_152","_ref_153","_ref_154","_ref_155","_ref_156","_ref_157","_ref_158","_ref_159","_ref_160","_ref_161","_ref_162","_ref_163","_ref_164","_ref_165","_ref_166"],"sec-primitive-pattern-matches":["_ref_51"],"sec-regular-expression-pattern-matches":["_ref_52","_ref_53"],"sec-member-expression-pattern-matches":["_ref_54","_ref_55","_ref_167","_ref_168"],"sec-unary-algebraic-pattern-matches":["_ref_56","_ref_169","_ref_170"],"sec-relational-pattern-matches":["_ref_57","_ref_171","_ref_172","_ref_173","_ref_174","_ref_175","_ref_176","_ref_177","_ref_178","_ref_179","_ref_180","_ref_181","_ref_182","_ref_183","_ref_184","_ref_185","_ref_186","_ref_187","_ref_188","_ref_189","_ref_190"],"sec-combined-match-pattern-matches":["_ref_58","_ref_59","_ref_60","_ref_61","_ref_62","_ref_63","_ref_191","_ref_192","_ref_193","_ref_194","_ref_195","_ref_196","_ref_197","_ref_198","_ref_199","_ref_200"],"sec-match-expression-runtime-semantics-evaluation":["_ref_64","_ref_207","_ref_208"],"sec-match-clauses-runtime-semantics-evaluation":["_ref_65","_ref_66","_ref_67","_ref_68","_ref_69","_ref_70","_ref_71","_ref_72","_ref_209","_ref_210","_ref_211","_ref_212","_ref_213","_ref_214","_ref_215","_ref_216"],"sec-match-clause-runtime-semantics-evaluation":["_ref_73","_ref_74","_ref_75","_ref_217","_ref_218"],"sec-invoke-custom-matcher":["_ref_76","_ref_77","_ref_78","_ref_79"],"sec-validatecustommatcherhint":["_ref_80"],"sec-primary-expression":["_ref_81"],"sec-relational-operators":["_ref_83"],"sec-static-semantics-hascallintailposition":["_ref_86","_ref_87","_ref_88","_ref_89","_ref_90","_ref_91","_ref_92","_ref_93","_ref_94","_ref_95","_ref_96","_ref_97","_ref_98","_ref_99"],"sec-match-patterns-early-errors":["_ref_140","_ref_141","_ref_142","_ref_143","_ref_144","_ref_145","_ref_146","_ref_147","_ref_148","_ref_149","_ref_150"],"sec-match-expression":["_ref_201","_ref_202","_ref_203","_ref_204","_ref_205","_ref_206"]},"entries":[{"type":"clause","id":"welcome","titleHTML":"Welcome","number":"1"},{"type":"table","id":"table-1","number":1,"caption":"Table 1: Well-known Symbols"},{"type":"term","term":"@@customMatcher","refId":"sec-well-known-symbols"},{"type":"clause","id":"sec-well-known-symbols","titleHTML":"Well-Known Symbols","number":"6.1.5.1","referencingIds":["_ref_12","_ref_17","_ref_19","_ref_21","_ref_27","_ref_41","_ref_79"]},{"type":"clause","id":"sec-ecmascript-language-types-symbol-type","titleHTML":"The Symbol Type","number":"6.1.5","referencingIds":["_ref_14","_ref_15"]},{"type":"clause","id":"sec-object-internal-methods-and-internal-slots","titleHTML":"Object Internal Methods and Internal Slots","number":"6.1.7"},{"type":"clause","id":"sec-ecmascript-language-types","titleHTML":"ECMAScript Language Types","number":"6.1","referencingIds":["_ref_6","_ref_42","_ref_51","_ref_52","_ref_54","_ref_56","_ref_57","_ref_58","_ref_65","_ref_66","_ref_69","_ref_72","_ref_73","_ref_74","_ref_76","_ref_77","_ref_78","_ref_80"]},{"type":"op","aoid":"Type","refId":"sec-ecmascript-data-types-and-values"},{"type":"clause","id":"sec-ecmascript-data-types-and-values","titleHTML":"ECMAScript Data Types and Values","number":"6"},{"type":"term","term":"InitializeInstance","refId":"sec-initializeinstance"},{"type":"op","aoid":"InitializeInstanceElements","refId":"sec-initializeinstance"},{"type":"clause","id":"sec-initializeinstance","title":"InitializeInstanceElements ( O, constructor )","titleHTML":"InitializeInstanceElements ( <var>O</var>, <var>constructor</var> )","number":"7.3.34","referencingIds":["_ref_2"]},{"type":"clause","id":"sec-operations-on-objects","titleHTML":"Operations on Objects","number":"7.3"},{"type":"clause","id":"sec-abstract-operations","titleHTML":"Abstract Operations","number":"7"},{"type":"clause","id":"sec-weakly-hold-execution","titleHTML":"Execution","number":"9.10.3"},{"type":"clause","id":"sec-weakly-hold-targets-processing-model","title":"Processing Model of WeakRef and FinalizationRegistryweakly hold Targets","titleHTML":"Processing Model of <del>WeakRef and FinalizationRegistry</del><ins>weakly hold</ins> Targets","number":"9.10"},{"type":"clause","id":"sec-executable-code-and-execution-contexts","titleHTML":"Executable Code and Execution Contexts","number":"9"},{"type":"clause","id":"sec-primary-expression-match-expression","titleHTML":"Match Expression","number":"13.2.10"},{"type":"clause","id":"sec-primary-expression","titleHTML":"Primary Expression","number":"13.2"},{"type":"clause","id":"sec-relational-operators-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: Evaluation","number":"13.10.1"},{"type":"clause","id":"sec-relational-operators","titleHTML":"Relational Operators","number":"13.10"},{"type":"clause","id":"sec-ecmascript-language-expressions","titleHTML":"ECMAScript Language: Expressions","number":"13"},{"type":"op","aoid":"ClassDefinitionEvaluation","refId":"sec-runtime-semantics-classdefinitionevaluation"},{"type":"clause","id":"sec-runtime-semantics-classdefinitionevaluation","titleHTML":"Runtime Semantics: ClassDefinitionEvaluation","number":"15.7.14","referencingIds":["_ref_3"]},{"type":"clause","id":"sec-class-definitions","titleHTML":"Class Definitions","number":"15.7"},{"type":"clause","id":"sec-static-semantics-hascallintailposition","title":"\\n        Static Semantics: HasCallInTailPosition (\\n          call: a CallExpression Parse Node, a MemberExpression Parse Node, or an OptionalChain Parse Node,\\n        ): a Boolean\\n      ","titleHTML":"\\n        Static Semantics: HasCallInTailPosition (\\n          <var>call</var>: a <emu-nt>CallExpression</emu-nt> Parse Node, a <emu-nt>MemberExpression</emu-nt> Parse Node, or an <emu-nt>OptionalChain</emu-nt> Parse Node,\\n        ): a Boolean\\n      ","number":"15.10.2"},{"type":"clause","id":"sec-tail-position-calls","titleHTML":"Tail Position Calls","number":"15.10"},{"type":"clause","id":"sec-ecmascript-language-functions-and-classes","titleHTML":"ECMAScript Language: Functions and Classes","number":"15"},{"type":"clause","id":"sec-object-@@custommatcher","title":"Object [ @@customMatcher ] ( subject, hint )","titleHTML":"Object [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.1.2.24"},{"type":"clause","id":"sec-properties-of-the-object-constructor","titleHTML":"Properties of the Object Constructor","number":"20.1.2"},{"type":"clause","id":"sec-object-objects","titleHTML":"Object Objects","number":"20.1"},{"type":"clause","id":"sec-function-@@custommatcher","title":"Function [ @@customMatcher ] ( subject, hint )","titleHTML":"Function [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.2.2.2"},{"type":"clause","id":"sec-properties-of-the-function-constructor","titleHTML":"Properties of the Function Constructor","number":"20.2.2"},{"type":"clause","id":"sec-function.prototype-@@custommatcher","title":"Function.prototype [ @@customMatcher ] ( subject, hint, receiver )","titleHTML":"Function.prototype [ @@customMatcher ] ( <var>subject</var>, <var>hint</var>, <var>receiver</var> )","number":"20.2.3.7","referencingIds":["_ref_1"]},{"type":"clause","id":"sec-properties-of-the-function-prototype-object","titleHTML":"Properties of the Function Prototype Object","number":"20.2.3"},{"type":"clause","id":"sec-function-objects","titleHTML":"Function Objects","number":"20.2"},{"type":"clause","id":"sec-boolean-@@custommatcher","title":"Boolean [ @@customMatcher ] ( subject, hint )","titleHTML":"Boolean [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.3.2.2"},{"type":"clause","id":"sec-properties-of-the-boolean-constructor","titleHTML":"Properties of the Boolean Constructor","number":"20.3.2"},{"type":"clause","id":"sec-boolean-objects","titleHTML":"Boolean Objects","number":"20.3"},{"type":"clause","id":"sec-symbol.custommatcher","titleHTML":"Symbol.customMatcher","number":"20.4.2.17"},{"type":"clause","id":"sec-symbol-@@custommatcher","title":"Symbol [ @@customMatcher ] ( subject, hint )","titleHTML":"Symbol [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.4.2.18"},{"type":"clause","id":"sec-properties-of-the-symbol-constructor","titleHTML":"Properties of the Symbol Constructor","number":"20.4.2"},{"type":"clause","id":"sec-symbol-objects","titleHTML":"Symbol Objects","number":"20.4"},{"type":"clause","id":"sec-error-message","title":"Error ( message [ , options ] )","titleHTML":"Error ( <var>message</var> [ , <var>options</var> ] )","number":"20.5.1.1"},{"type":"clause","id":"sec-error-constructor","titleHTML":"The Error Constructor","number":"20.5.1"},{"type":"clause","id":"sec-error-@@custommatcher","title":"Error [ @@customMatcher ] ( subject, hint )","titleHTML":"Error [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.5.2.2"},{"type":"clause","id":"sec-properties-of-the-error-constructors","titleHTML":"Properties of the Error Constructor","number":"20.5.2"},{"type":"clause","id":"sec-properties-of-error-instances","titleHTML":"Properties of Error Instances","number":"20.5.4"},{"type":"clause","id":"sec-nativeerror","title":"NativeError ( message [ , options ] )","titleHTML":"<var>NativeError</var> ( <var>message</var> [ , <var>options</var> ] )","number":"20.5.6.1.1"},{"type":"clause","id":"sec-nativeerror-constructors","title":"The NativeError Constructors","titleHTML":"The <var>NativeError</var> Constructors","number":"20.5.6.1"},{"type":"clause","id":"sec-nativeerror-@@custommatcher","title":"NativeError [ @@customMatcher ] ( subject, hint )","titleHTML":"<var>NativeError</var> [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.5.6.2.2"},{"type":"clause","id":"sec-properties-of-the-nativeerror-constructors","title":"Properties of the NativeError Constructors","titleHTML":"Properties of the <var>NativeError</var> Constructors","number":"20.5.6.2"},{"type":"clause","id":"sec-properties-of-nativeerror-instances","title":"Properties of NativeError Instances","titleHTML":"Properties of <var>NativeError</var> Instances","number":"20.5.6.4"},{"type":"clause","id":"sec-nativeerror-object-structure","title":"NativeError Object Structure","titleHTML":"<var>NativeError</var> Object Structure","number":"20.5.6"},{"type":"clause","id":"sec-aggregate-error","title":"AggregateError ( errors, message [ , options ] )","titleHTML":"AggregateError ( <var>errors</var>, <var>message</var> [ , <var>options</var> ] )","number":"20.5.7.1.1"},{"type":"clause","id":"sec-aggregate-error-constructor","titleHTML":"The AggregateError Constructor","number":"20.5.7.1"},{"type":"clause","id":"sec-aggregate-error-@@custommatcher","title":"AggregateError [ @@customMatcher ] ( subject, hint )","titleHTML":"AggregateError [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.5.7.2.2"},{"type":"clause","id":"sec-properties-of-the-aggregate-error-constructors","titleHTML":"Properties of the AggregateError Constructor","number":"20.5.7.2"},{"type":"clause","id":"sec-properties-of-aggregate-error-instances","titleHTML":"Properties of AggregateError Instances","number":"20.5.7.4"},{"type":"clause","id":"sec-aggregate-error-objects","titleHTML":"AggregateError Objects","number":"20.5.7"},{"type":"clause","id":"sec-error-objects","titleHTML":"Error Objects","number":"20.5"},{"type":"clause","id":"sec-fundamental-objects","titleHTML":"Fundamental Objects","number":"20"},{"type":"clause","id":"sec-number-@@custommatcher","title":"Number [ @@customMatcher ] ( subject, hint )","titleHTML":"Number [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"21.1.2.16"},{"type":"clause","id":"sec-properties-of-the-number-constructor","titleHTML":"Properties of the Number Constructor","number":"21.1.2"},{"type":"clause","id":"sec-number-objects","titleHTML":"Number Objects","number":"21.1"},{"type":"clause","id":"sec-bigint-@@custommatcher","title":"BigInt [ @@customMatcher ] ( subject, hint )","titleHTML":"BigInt [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"21.2.2.4"},{"type":"clause","id":"sec-properties-of-the-bigint-constructor","titleHTML":"Properties of the BigInt Constructor","number":"21.2.2"},{"type":"clause","id":"sec-bigint-objects","titleHTML":"BigInt Objects","number":"21.2"},{"type":"clause","id":"sec-date-@@custommatcher","title":"Date [ @@customMatcher ] ( subject, hint )","titleHTML":"Date [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"21.4.3.5"},{"type":"clause","id":"sec-properties-of-the-date-constructor","titleHTML":"Properties of the Date Constructor","number":"21.4.3"},{"type":"clause","id":"sec-date-objects","titleHTML":"Date Objects","number":"21.4"},{"type":"clause","id":"sec-numbers-and-dates","titleHTML":"Numbers and Dates","number":"21"},{"type":"clause","id":"sec-string-@@custommatcher","title":"String [ @@customMatcher ] ( subject, hint )","titleHTML":"String [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"22.1.2.5","referencingIds":["_ref_5"]},{"type":"clause","id":"sec-properties-of-the-string-constructor","titleHTML":"Properties of the String Constructor","number":"22.1.2"},{"type":"clause","id":"sec-string-objects","titleHTML":"String Objects","number":"22.1"},{"type":"clause","id":"sec-regexp-@@custommatcher","title":"RegExp [ @@customMatcher ] ( subject, hint )","titleHTML":"RegExp [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"22.2.5.3"},{"type":"clause","id":"sec-properties-of-the-regexp-constructor","titleHTML":"Properties of the RegExp Constructor","number":"22.2.5"},{"type":"clause","id":"sec-regexp.prototype-@@custommatcher","title":"RegExp.prototype [ @@customMatcher ] ( subject, hint )","titleHTML":"RegExp.prototype [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"22.2.6.20"},{"type":"clause","id":"sec-properties-of-the-regexp-prototype-object","titleHTML":"Properties of the RegExp Prototype Object","number":"22.2.6"},{"type":"clause","id":"sec-regexp-regular-expression-objects","titleHTML":"RegExp (Regular Expression) Objects","number":"22.2"},{"type":"clause","id":"sec-text-processing","titleHTML":"Text Processing","number":"22"},{"type":"clause","id":"sec-array-@@custommatcher","title":"Array [ @@customMatcher ] ( subject, hint )","titleHTML":"Array [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"23.1.2.6"},{"type":"clause","id":"sec-properties-of-the-array-constructor","titleHTML":"Properties of the Array Constructor","number":"23.1.2"},{"type":"clause","id":"sec-array-objects","titleHTML":"Array Objects","number":"23.1"},{"type":"clause","id":"sec-_typedarray_-@@custommatcher","title":"TypedArray [ @@customMatcher ] ( subject, hint )","titleHTML":"<var>TypedArray</var> [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"23.2.6.3"},{"type":"clause","id":"sec-properties-of-the-typedarray-constructors","title":"Properties of the TypedArray Constructors","titleHTML":"Properties of the <var>TypedArray</var> Constructors","number":"23.2.6"},{"type":"clause","id":"sec-typedarray-objects","titleHTML":"TypedArray Objects","number":"23.2"},{"type":"clause","id":"sec-indexed-collections","titleHTML":"Indexed Collections","number":"23"},{"type":"clause","id":"sec-map-@@custommatcher","title":"Map [ @@customMatcher ] ( subject, hint )","titleHTML":"Map [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"24.1.2.3"},{"type":"clause","id":"sec-properties-of-the-map-constructor","titleHTML":"Properties of the Map Constructor","number":"24.1.2"},{"type":"clause","id":"sec-map-objects","titleHTML":"Map Objects","number":"24.1"},{"type":"clause","id":"sec-set-@@custommatcher","title":"Set [ @@customMatcher ] ( subject, hint )","titleHTML":"Set [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"24.2.2.3"},{"type":"clause","id":"sec-properties-of-the-set-constructor","titleHTML":"Properties of the Set Constructor","number":"24.2.2"},{"type":"clause","id":"sec-set-objects","titleHTML":"Set Objects","number":"24.2"},{"type":"clause","id":"sec-weakmap-@@custommatcher","title":"WeakMap [ @@customMatcher ] ( subject, hint )","titleHTML":"WeakMap [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"24.3.2.2"},{"type":"clause","id":"sec-properties-of-the-weakmap-constructor","titleHTML":"Properties of the WeakMap Constructor","number":"24.3.2"},{"type":"clause","id":"sec-weakmap-objects","titleHTML":"WeakMap Objects","number":"24.3"},{"type":"clause","id":"sec-weakset-@@custommatcher","title":"WeakSet [ @@customMatcher ] ( subject, hint )","titleHTML":"WeakSet [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"24.4.2.2"},{"type":"clause","id":"sec-properties-of-the-weakset-constructor","titleHTML":"Properties of the WeakSet Constructor","number":"24.4.2"},{"type":"clause","id":"sec-weakset-objects","titleHTML":"WeakSet Objects","number":"24.4"},{"type":"clause","id":"sec-keyed-collections","titleHTML":"Keyed Collections","number":"24"},{"type":"clause","id":"sec-arraybuffer-@@custommatcher","title":"ArrayBuffer [ @@customMatcher ] ( subject, hint )","titleHTML":"ArrayBuffer [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"25.1.5.4"},{"type":"clause","id":"sec-properties-of-the-arraybuffer-constructor","titleHTML":"Properties of the ArrayBuffer Constructor","number":"25.1.5"},{"type":"clause","id":"sec-arraybuffer-objects","titleHTML":"ArrayBuffer Objects","number":"25.1"},{"type":"clause","id":"sec-sharedarraybuffer-@@custommatcher","title":"SharedArrayBuffer [ @@customMatcher ] ( subject, hint )","titleHTML":"SharedArrayBuffer [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"25.2.4.3"},{"type":"clause","id":"sec-properties-of-the-sharedarraybuffer-constructor","titleHTML":"Properties of the SharedArrayBuffer Constructor","number":"25.2.4"},{"type":"clause","id":"sec-sharedarraybuffer-objects","titleHTML":"SharedArrayBuffer Objects","number":"25.2"},{"type":"clause","id":"sec-dataview-@@custommatcher","title":"DataView [ @@customMatcher ] ( subject, hint )","titleHTML":"DataView [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"25.3.3.2"},{"type":"clause","id":"sec-properties-of-the-dataview-constructor","titleHTML":"Properties of the DataView Constructor","number":"25.3.3"},{"type":"clause","id":"sec-dataview-objects","titleHTML":"DataView Objects","number":"25.3"},{"type":"clause","id":"sec-structured-data","titleHTML":"Structured Data","number":"25"},{"type":"clause","id":"sec-weakref-@@custommatcher","title":"WeakRef [ @@customMatcher ] ( subject, hint )","titleHTML":"WeakRef [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"26.1.2.2"},{"type":"clause","id":"sec-properties-of-the-weak-ref-constructor","titleHTML":"Properties of the WeakRef Constructor","number":"26.1.2"},{"type":"clause","id":"sec-weak-ref-objects","titleHTML":"WeakRef Objects","number":"26.1"},{"type":"clause","id":"sec-finalizationregistry-@@custommatcher","title":"FinalizationRegistry [ @@customMatcher ] ( subject, hint )","titleHTML":"FinalizationRegistry [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"26.2.2.2"},{"type":"clause","id":"sec-properties-of-the-finalization-registry-constructor","titleHTML":"Properties of the FinalizationRegistry Constructor","number":"26.2.2"},{"type":"clause","id":"sec-finalization-registry-objects","titleHTML":"FinalizationRegistry Objects","number":"26.2"},{"type":"clause","id":"sec-managing-memory","titleHTML":"Managing Memory","number":"26"},{"type":"clause","id":"sec-promise-@@custommatcher","title":"Promise [ @@customMatcher ] ( subject, hint )","titleHTML":"Promise [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"27.2.4.9"},{"type":"clause","id":"sec-properties-of-the-promise-constructor","titleHTML":"Properties of the Promise Constructor","number":"27.2.4"},{"type":"clause","id":"sec-promise-objects","titleHTML":"Promise Objects","number":"27.2"},{"type":"clause","id":"sec-control-abstraction-objects","titleHTML":"Control Abstraction Objects","number":"27"},{"type":"clause","id":"sec-proxy-@@custommatcher","titleHTML":"Proxy [ @@customMatcher ] ( )","number":"28.2.1.2"},{"type":"clause","id":"sec-proxy-constructor","titleHTML":"The Proxy Constructor","number":"28.2.1"},{"type":"clause","id":"sec-proxy-objects","titleHTML":"Proxy Objects","number":"28.2"},{"type":"clause","id":"sec-reflection","titleHTML":"Reflection","number":"28"},{"type":"production","id":"prod-MatchPattern","name":"MatchPattern","referencingIds":["_ref_83","_ref_84","_ref_85","_ref_86","_ref_99","_ref_100","_ref_135","_ref_136","_ref_137","_ref_138","_ref_139","_ref_140","_ref_141","_ref_142","_ref_144","_ref_145","_ref_146","_ref_148","_ref_149","_ref_151","_ref_152","_ref_191","_ref_192","_ref_193","_ref_194","_ref_195","_ref_196","_ref_197","_ref_198","_ref_199","_ref_200","_ref_206","_ref_217","_ref_218"]},{"type":"production","id":"prod-PrimitivePattern","name":"PrimitivePattern","referencingIds":["_ref_101","_ref_153","_ref_154"]},{"type":"production","id":"prod-RegularExpressionPattern","name":"RegularExpressionPattern","referencingIds":["_ref_102","_ref_155","_ref_156"]},{"type":"production","id":"prod-MemberExpressionPattern","name":"MemberExpressionPattern","referencingIds":["_ref_103","_ref_157","_ref_158"]},{"type":"production","id":"prod-PatternMatchingMemberExpression","name":"PatternMatchingMemberExpression","referencingIds":["_ref_108","_ref_109","_ref_110","_ref_111","_ref_112","_ref_114","_ref_115","_ref_120","_ref_127","_ref_128","_ref_167","_ref_168","_ref_179","_ref_180"]},{"type":"production","id":"prod-UnaryAlgebraicPattern","name":"UnaryAlgebraicPattern","referencingIds":["_ref_104","_ref_159","_ref_160"]},{"type":"production","id":"prod-PatternMatchingUnaryAlgebraicExpression","name":"PatternMatchingUnaryAlgebraicExpression","referencingIds":["_ref_113","_ref_126","_ref_129","_ref_169","_ref_170"]},{"type":"production","id":"prod-RelationalPattern","name":"RelationalPattern","referencingIds":["_ref_105","_ref_161","_ref_162"]},{"type":"production","id":"prod-PatternMatchingAlgebraicExpression","name":"PatternMatchingAlgebraicExpression","referencingIds":["_ref_116","_ref_117","_ref_118","_ref_119","_ref_171","_ref_172","_ref_173","_ref_174","_ref_175","_ref_176","_ref_177","_ref_178"]},{"type":"production","id":"prod-PatternMatchingStringLikeExpression","name":"PatternMatchingStringLikeExpression","referencingIds":["_ref_121","_ref_130","_ref_131","_ref_132","_ref_133","_ref_181","_ref_182"]},{"type":"production","id":"prod-PatternMatchingExpression","name":"PatternMatchingExpression","referencingIds":["_ref_122","_ref_123","_ref_124","_ref_125","_ref_134","_ref_183","_ref_184","_ref_185","_ref_186","_ref_187","_ref_188","_ref_189","_ref_190"]},{"type":"production","id":"prod-IfPattern","name":"IfPattern","referencingIds":["_ref_106","_ref_163","_ref_164"]},{"type":"production","id":"prod-CombinedMatchPattern","name":"CombinedMatchPattern","referencingIds":["_ref_107","_ref_143","_ref_147","_ref_150","_ref_165","_ref_166"]},{"type":"clause","id":"sec-match-patterns-early-errors","titleHTML":"Static Semantics: Early Errors","number":"30.1.1"},{"type":"clause","id":"sec-match-patterns","titleHTML":"Match Patterns","number":"30.1"},{"type":"op","aoid":"MatchPatternMatches","refId":"sec-match-pattern-matches"},{"type":"clause","id":"sec-match-pattern-matches","titleHTML":"Runtime Semantics: MatchPatternMatches","number":"30.2.1","referencingIds":["_ref_7","_ref_43","_ref_59","_ref_60","_ref_61","_ref_62","_ref_63","_ref_75"]},{"type":"op","aoid":"PrimitivePatternMatches","refId":"sec-primitive-pattern-matches"},{"type":"clause","id":"sec-primitive-pattern-matches","titleHTML":"Runtime Semantics: PrimitivePatternMatches","number":"30.2.2","referencingIds":["_ref_44"]},{"type":"op","aoid":"RegularExpressionPatternMatches","refId":"sec-regular-expression-pattern-matches"},{"type":"clause","id":"sec-regular-expression-pattern-matches","titleHTML":"Runtime Semantics: RegularExpressionPatternMatches","number":"30.2.3","referencingIds":["_ref_45"]},{"type":"op","aoid":"MemberExpressionPatternMatches","refId":"sec-member-expression-pattern-matches"},{"type":"clause","id":"sec-member-expression-pattern-matches","titleHTML":"Runtime Semantics: MemberExpressionPatternMatches","number":"30.2.4","referencingIds":["_ref_46"]},{"type":"op","aoid":"UnaryAlgebraicPatternMatches","refId":"sec-unary-algebraic-pattern-matches"},{"type":"clause","id":"sec-unary-algebraic-pattern-matches","titleHTML":"Runtime Semantics: UnaryAlgebraicPatternMatches","number":"30.2.5","referencingIds":["_ref_47"]},{"type":"op","aoid":"RelationalPatternMatches","refId":"sec-relational-pattern-matches"},{"type":"clause","id":"sec-relational-pattern-matches","titleHTML":"Runtime Semantics: RelationalPatternMatches","number":"30.2.6","referencingIds":["_ref_48"]},{"type":"op","aoid":"IfPatternMatches","refId":"sec-if-pattern-matches"},{"type":"clause","id":"sec-if-pattern-matches","titleHTML":"Runtime Semantics: IfPatternMatches","number":"30.2.7","referencingIds":["_ref_49"]},{"type":"op","aoid":"CombinedMatchPatternMatches","refId":"sec-combined-match-pattern-matches"},{"type":"clause","id":"sec-combined-match-pattern-matches","titleHTML":"Runtime Semantics: CombinedMatchPatternMatches","number":"30.2.8","referencingIds":["_ref_50"]},{"type":"clause","id":"sec-match-pattern-semantics","titleHTML":"Match Pattern Semantics","number":"30.2"},{"type":"production","id":"prod-MatchExpression","name":"MatchExpression","referencingIds":["_ref_81","_ref_82","_ref_87","_ref_88"]},{"type":"production","id":"prod-MatchClauses","name":"MatchClauses","referencingIds":["_ref_89","_ref_90","_ref_93","_ref_95","_ref_97","_ref_98","_ref_201","_ref_203","_ref_205","_ref_207","_ref_208","_ref_211","_ref_213","_ref_215","_ref_216"]},{"type":"production","id":"prod-MatchClause","name":"MatchClause","referencingIds":["_ref_91","_ref_92","_ref_94","_ref_96","_ref_202","_ref_204","_ref_209","_ref_210","_ref_212","_ref_214"]},{"type":"clause","id":"sec-match-expression-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: Evaluation","number":"30.3.1"},{"type":"op","aoid":"MatchClausesEvaluation","refId":"sec-match-clauses-runtime-semantics-evaluation"},{"type":"clause","id":"sec-match-clauses-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: MatchClausesEvaluation","number":"30.3.2","referencingIds":["_ref_64","_ref_68","_ref_71"]},{"type":"op","aoid":"MatchClauseEvaluation","refId":"sec-match-clause-runtime-semantics-evaluation"},{"type":"clause","id":"sec-match-clause-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: MatchClauseEvaluation","number":"30.3.3","referencingIds":["_ref_67","_ref_70"]},{"type":"clause","id":"sec-match-expression","titleHTML":"Match Expression","number":"30.3","referencingIds":["_ref_4"]},{"type":"op","aoid":"InvokeCustomMatcher","refId":"sec-invoke-custom-matcher"},{"type":"clause","id":"sec-invoke-custom-matcher","title":"InvokeCustomMatcher ( matcher, subject, kind, receiver )","titleHTML":"<ins>InvokeCustomMatcher ( <var>matcher</var>, <var>subject</var>, <var>kind</var>, <var>receiver</var> )</ins>","number":"30.4.1","referencingIds":["_ref_53","_ref_55"]},{"type":"op","aoid":"ValidateCustomMatcherHint","refId":"sec-validatecustommatcherhint"},{"type":"clause","id":"sec-validatecustommatcherhint","title":"ValidateCustomMatcherHint ( hint [ , kind ] )","titleHTML":"ValidateCustomMatcherHint ( <var>hint</var> [ , <var>kind</var> ] )","number":"30.4.2","referencingIds":["_ref_8","_ref_9","_ref_10","_ref_11","_ref_13","_ref_16","_ref_18","_ref_20","_ref_22","_ref_23","_ref_24","_ref_25","_ref_26","_ref_28","_ref_29","_ref_30","_ref_31","_ref_32","_ref_33","_ref_34","_ref_35","_ref_36","_ref_37","_ref_38","_ref_39","_ref_40"]},{"type":"clause","id":"sec-abstract-operations-for-pattern-matching","titleHTML":"Abstract Operations for Pattern Matching","number":"30.4"},{"type":"clause","id":"sec-pattern-matching","title":"Pattern Matching","titleHTML":"<ins>Pattern Matching</ins>","number":"30"},{"type":"clause","id":"sec-notes-layering","titleHTML":"Layering","number":"31.1"},{"type":"clause","id":"sec-notes-code-example","titleHTML":"Code example","number":"31.2"},{"type":"clause","id":"sec-notes","titleHTML":"Editor's notes","number":"31","referencingIds":["_ref_0"]},{"type":"clause","id":"sec-copyright-and-software-license","title":"Copyright & Software License","titleHTML":"Copyright &amp; Software License","number":"A"}]}`);
;let usesMultipage = false