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

  // unpin all button
  document
    .querySelector('#menu-pins .unpin-all')
    .addEventListener('click', this.unpinAll.bind(this));

  // individual unpinning buttons
  this.$pinList.addEventListener('click', this.pinListClick.bind(this));

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
  } else if (e.keyCode >= 48 && e.keyCode < 58) {
    this.selectPin((e.keyCode - 9) % 10);
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

  let text;
  if (entry.type === 'clause') {
    let prefix;
    if (entry.number) {
      prefix = entry.number + ' ';
    } else {
      prefix = '';
    }
    // prettier-ignore
    text = `${prefix}${entry.titleHTML}`;
  } else {
    text = getKey(entry);
  }

  let link = `<a href="${makeLinkToId(entry.id)}">${text}</a>`;
  this.$pinList.innerHTML += `<li data-section-id="${id}">${link}<button class="unpin">\u{2716}</button></li>`;

  if (Object.keys(this._pinnedIds).length === 0) {
    this.showPins();
  }
  this._pinnedIds[id] = true;
  this.persistPinEntries();
};

Menu.prototype.removePinEntry = function (id) {
  let item = this.$pinList.querySelector(`li[data-section-id="${id}"]`);
  this.$pinList.removeChild(item);
  delete this._pinnedIds[id];
  if (Object.keys(this._pinnedIds).length === 0) {
    this.hidePins();
  }

  this.persistPinEntries();
};

Menu.prototype.unpinAll = function () {
  for (let id of Object.keys(this._pinnedIds)) {
    this.removePinEntry(id);
  }
};

Menu.prototype.pinListClick = function (event) {
  if (event?.target?.classList.contains('unpin')) {
    let id = event.target.parentNode.dataset.sectionId;
    if (id) {
      this.removePinEntry(id);
    }
  }
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

let sdoMap = JSON.parse(`{"prod-EdmoEhta":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-9oXzuZL6"]}},"prod-XSmG8KFu":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-UB1LtDnR"]}},"prod-jdvmig2z":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-BHK6aZq8"]}},"prod-zNwY0NcB":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-YG9CRILW"]},"MatchExpressionClausesEvaluation":{"clause":"30.3.3","ids":["prod-Rom5m7Ja"]}},"prod-ZOtaLsb5":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-O1ji-jbG"]},"MatchExpressionClausesEvaluation":{"clause":"30.3.3","ids":["prod-ndBX1W1V"]}},"prod-inqwxZRh":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-ac1fz2Ib"]},"MatchExpressionClausesEvaluation":{"clause":"30.3.3","ids":["prod--Nw1hDs1"]}},"prod-iGULIx-t":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-4UejTJZU"]},"MatchExpressionClausesEvaluation":{"clause":"30.3.3","ids":["prod-QDysejGw"]}},"prod-POLnbn8y":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-FYuYdt05"]},"MatchExpressionClauseEvaluation":{"clause":"30.3.4","ids":["prod-dgN-SNm3"]}},"prod-ZChwI7W3":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-KL2SLw-E"]}},"prod-AXLzmRau":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-Y7mi4wZA"]},"MatchStatementClausesEvaluation":{"clause":"30.2.3","ids":["prod-ji-8YLgk"]}},"prod-fZ0-1zGe":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-PqzPV1Pw"]},"MatchStatementClausesEvaluation":{"clause":"30.2.3","ids":["prod-Ruu_soZe"]}},"prod-WL2_TZSP":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-HzzICLSq"]},"MatchStatementClausesEvaluation":{"clause":"30.2.3","ids":["prod-ZURxy2My"]}},"prod-M8VQiquN":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-F58Lq2oZ"]},"MatchStatementClausesEvaluation":{"clause":"30.2.3","ids":["prod-LK25Bzur"]}},"prod-ZIlZDxI_":{"HasCallInTailPosition":{"clause":"15.10.2","ids":["prod-hvgUur-O"]},"MatchStatementClauseEvaluation":{"clause":"30.2.4","ids":["prod-IEy-JxDs"]}},"prod-CieYjAI6":{"CapturingGroupName":{"clause":"22.2.1.9","ids":["prod-n_is87x3"]}},"prod-V5d_xiQC":{"CapturingGroupName":{"clause":"22.2.1.9","ids":["prod--5zPg8w0"]}},"prod-gb-onOzg":{"IsOptionalPattern":{"clause":"30.1.2","ids":["prod-yCjtcQ2s"]},"ListPatternInnerMatches":{"clause":"30.1.12","ids":["prod-xREui9vq"]}},"prod--q9atpfX":{"IsOptionalPattern":{"clause":"30.1.2","ids":["prod-uWaCy0rP"]},"ListPatternInnerMatches":{"clause":"30.1.12","ids":["prod-OcHtMyto"]}},"prod-SwXPxa2u":{"IsOptionalPattern":{"clause":"30.1.2","ids":["prod-NV8BPc1p"]},"ListPatternInnerMatches":{"clause":"30.1.12","ids":["prod-3oXeLOQS"]}},"prod-lKjcdi_o":{"IsOptionalPattern":{"clause":"30.1.2","ids":["prod-Eavr6r2E"]},"ListPatternInnerMatches":{"clause":"30.1.12","ids":["prod-wWtr3ozj"]}},"prod-Q-aCS0Yx":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-A9b_MWQ_"]}},"prod-KUcUUgsn":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-U80C8biY"]}},"prod-NnfvhTBM":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-6fPS70C2"]}},"prod-rUik7whR":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod--V9XD3hp"]}},"prod-Nk3Ek8wq":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-jr6yvrk2"]}},"prod-dtu4srcz":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-vBMoWeeV"]}},"prod-ZdrTiyJE":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-mpb2HCVB"]}},"prod-l2SLZUMT":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-QXRatsJR"]}},"prod-en0pW04U":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-MW-Egi0C"]}},"prod-LetWbF4Q":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-E8S1P1H4"]}},"prod-GC1hibKU":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-rvZDZ_Jw"]}},"prod-LAj8DpMp":{"MatchPatternMatches":{"clause":"30.1.3","ids":["prod-EquXXU0V"]}},"prod-lZG2aTTb":{"PrimitivePatternMatches":{"clause":"30.1.4","ids":["prod-mlLTmHeP"]}},"prod-rqU7_eLx":{"PrimitivePatternMatches":{"clause":"30.1.4","ids":["prod-eFLzsKUd"]}},"prod-BsXVlJbS":{"BindingPatternMatches":{"clause":"30.1.5","ids":["prod-ScW2NtRV"]}},"prod-ttS1PbAl":{"RegularExpressionPatternMatches":{"clause":"30.1.6","ids":["prod-CGW2GUqY"]}},"prod-VZea49vA":{"RegularExpressionPatternMatches":{"clause":"30.1.6","ids":["prod-QAYEP46R"]}},"prod-G4gXeSPg":{"MemberExpressionPatternMatches":{"clause":"30.1.7","ids":["prod--tiCo4Kg"]}},"prod-QmuUz1ZR":{"MemberExpressionPatternMatches":{"clause":"30.1.7","ids":["prod-UC7vB794"]}},"prod-nriCsL_r":{"ObjectPatternMatches":{"clause":"30.1.8","ids":["prod-ijKqIu5y"]}},"prod-EWVgVnxN":{"ObjectPatternMatches":{"clause":"30.1.8","ids":["prod-rsN4rFAw"]}},"prod-UnQjidH-":{"ObjectPatternMatches":{"clause":"30.1.8","ids":["prod-t1nKdCY9"]}},"prod-xpU3Tqeh":{"ObjectPatternMatches":{"clause":"30.1.8","ids":["prod-yj96DPDb"]}},"prod-NpqrpNeK":{"ObjectPatternInnerMatches":{"clause":"30.1.9","ids":["prod-CVegFgkL"]}},"prod-kRoJE3bP":{"ObjectPatternInnerMatches":{"clause":"30.1.9","ids":["prod-T4vISnOq"]}},"prod-_cQam8pS":{"ObjectPatternInnerMatches":{"clause":"30.1.9","ids":["prod-qAB6O-_U"]}},"prod-VxHnNNub":{"ObjectPatternInnerMatches":{"clause":"30.1.9","ids":["prod-wn8ysC7M"]}},"prod-GMqEmzsz":{"ObjectPatternInnerMatches":{"clause":"30.1.9","ids":["prod-K_6p11YI"]}},"prod-GO0bgB3_":{"ObjectPatternInnerMatches":{"clause":"30.1.9","ids":["prod-67mQe-Kl"]}},"prod-xrsY-24G":{"ObjectPatternInnerMatches":{"clause":"30.1.9","ids":["prod-dFlCv79J"]}},"prod-mfwF-eVh":{"ArrayPatternMatches":{"clause":"30.1.10","ids":["prod-PyMOIQ3Y"]}},"prod-xnwBdNr0":{"ListPatternMatches":{"clause":"30.1.11","ids":["prod-jo48_6Fj"]}},"prod-5aJhmP6v":{"ListPatternMatches":{"clause":"30.1.11","ids":["prod-ZH2p23SX"]}},"prod-Qinb_JH_":{"ListPatternMatches":{"clause":"30.1.11","ids":["prod-TB4qCm-Y"]}},"prod-fOlW2Nsd":{"ListPatternInnerMatches":{"clause":"30.1.12","ids":["prod-iIwhAXB2"]}},"prod-w_IWHbxt":{"ListPatternInnerMatches":{"clause":"30.1.12","ids":["prod-QkDn-2nd"]}},"prod-blOttJBG":{"UnaryAlgebraicPatternMatches":{"clause":"30.1.13","ids":["prod-HOehzcwY"]}},"prod-Ee4jkDah":{"RelationalPatternMatches":{"clause":"30.1.14","ids":["prod-HIh36vwy"]}},"prod-Lt1ufiOJ":{"RelationalPatternMatches":{"clause":"30.1.14","ids":["prod-7OFxsw1H"]}},"prod-MbwVHJm5":{"RelationalPatternMatches":{"clause":"30.1.14","ids":["prod-06obvqDG"]}},"prod-LIsJEGG_":{"RelationalPatternMatches":{"clause":"30.1.14","ids":["prod-RHBOL0Pm"]}},"prod-sQz7HIlw":{"RelationalPatternMatches":{"clause":"30.1.14","ids":["prod-yy5yPHTl"]}},"prod-wD-UQ48A":{"RelationalPatternMatches":{"clause":"30.1.14","ids":["prod-4m0pop5D"]}},"prod-LdC39dQb":{"RelationalPatternMatches":{"clause":"30.1.14","ids":["prod--dRddGUV"]}},"prod-WzM35PsW":{"RelationalPatternMatches":{"clause":"30.1.14","ids":["prod-w4_WjGgR"]}},"prod-ofL39yLB":{"RelationalPatternMatches":{"clause":"30.1.14","ids":["prod-7Ze364jc"]}},"prod-atFGrhH0":{"RelationalPatternMatches":{"clause":"30.1.14","ids":["prod-jvHPj17C"]}},"prod-F0nSIfMB":{"IfPatternMatches":{"clause":"30.1.15","ids":["prod-OcKu_40M"]}},"prod-a_2cW9fV":{"CombinedMatchPatternMatches":{"clause":"30.1.16","ids":["prod-TGrK8XcZ"]}},"prod-BMX8uZDG":{"CombinedMatchPatternMatches":{"clause":"30.1.16","ids":["prod-hYdo8hkU"]}},"prod-4IhLPseH":{"CombinedMatchPatternMatches":{"clause":"30.1.16","ids":["prod-_QtiVeJ1"]}}}`);
let biblio = JSON.parse(`{"refsByClause":{"sec-nav":["_ref_0","_ref_1","_ref_2","_ref_3","_ref_4","_ref_5","_ref_6","_ref_7","_ref_8","_ref_9","_ref_10","_ref_11","_ref_12","_ref_13","_ref_14","_ref_15","_ref_28"],"sec-organization-of-this-specification":["_ref_16"],"sec-primary-expression-match-expression":["_ref_17","_ref_255"],"sec-relational-operators":["_ref_18","_ref_256","_ref_257"],"sec-the-match-statement":["_ref_19"],"sec-match-patterns":["_ref_20","_ref_320","_ref_321","_ref_322","_ref_323","_ref_324","_ref_325","_ref_326","_ref_327","_ref_328","_ref_329","_ref_330","_ref_331","_ref_332","_ref_333","_ref_334","_ref_335","_ref_336","_ref_337","_ref_338","_ref_339","_ref_340","_ref_341","_ref_342","_ref_343","_ref_344","_ref_345","_ref_346","_ref_347","_ref_348","_ref_349","_ref_350","_ref_351","_ref_352","_ref_353","_ref_354","_ref_355","_ref_356","_ref_357","_ref_358","_ref_359","_ref_360","_ref_361","_ref_362","_ref_363","_ref_364","_ref_365","_ref_366","_ref_367","_ref_368","_ref_369","_ref_370","_ref_371","_ref_372","_ref_373","_ref_374","_ref_375","_ref_376","_ref_377","_ref_378","_ref_379","_ref_380","_ref_381","_ref_382","_ref_383","_ref_384","_ref_385","_ref_386","_ref_387","_ref_388","_ref_389","_ref_390","_ref_391","_ref_392","_ref_393","_ref_394","_ref_395","_ref_396","_ref_397","_ref_398","_ref_399","_ref_400"],"sec-regular-expression-pattern-matches":["_ref_21","_ref_22","_ref_23","_ref_24","_ref_121","_ref_122","_ref_123","_ref_124","_ref_125","_ref_126","_ref_464","_ref_465","_ref_466","_ref_467","_ref_468","_ref_469","_ref_470","_ref_471"],"sec-match-statement":["_ref_25","_ref_561","_ref_562","_ref_563","_ref_564","_ref_565","_ref_566"],"sec-match-expression":["_ref_26","_ref_584","_ref_585","_ref_586","_ref_587","_ref_588","_ref_589","_ref_590"],"sec-parsepattern-annexb":["_ref_27"],"sec-object-internal-methods-and-internal-slots":["_ref_29"],"sec-runtime-semantics-bindinginitialization":["_ref_30"],"sec-primary-expression-regular-expression-literals-static-semantics-early-errors":["_ref_31"],"sec-isvalidregularexpressionliteral":["_ref_32"],"sec-relational-operators-runtime-semantics-evaluation":["_ref_33","_ref_34","_ref_35","_ref_258","_ref_259","_ref_260","_ref_261"],"sec-static-semantics-hascallintailposition":["_ref_36","_ref_37","_ref_38","_ref_39","_ref_40","_ref_41","_ref_42","_ref_43","_ref_44","_ref_45","_ref_46","_ref_47","_ref_48","_ref_49","_ref_50","_ref_51","_ref_52","_ref_263","_ref_264","_ref_265","_ref_266","_ref_267","_ref_268","_ref_269","_ref_270","_ref_271","_ref_272","_ref_273","_ref_274","_ref_275","_ref_276","_ref_277","_ref_278","_ref_279","_ref_280","_ref_281","_ref_282","_ref_283","_ref_284","_ref_285","_ref_286","_ref_287","_ref_288"],"sec-object-@@custommatcher":["_ref_53"],"sec-function-@@custommatcher":["_ref_54"],"sec-function.prototype-@@custommatcher":["_ref_55"],"sec-boolean-@@custommatcher":["_ref_56"],"sec-symbol.custommatcher":["_ref_57"],"sec-symbol-@@custommatcher":["_ref_58","_ref_59","_ref_60"],"sec-error-@@custommatcher":["_ref_61"],"sec-properties-of-error-instances":["_ref_62"],"sec-nativeerror-@@custommatcher":["_ref_63"],"sec-properties-of-nativeerror-instances":["_ref_64"],"sec-aggregate-error-@@custommatcher":["_ref_65"],"sec-properties-of-aggregate-error-instances":["_ref_66"],"sec-number-@@custommatcher":["_ref_67"],"sec-bigint-@@custommatcher":["_ref_68"],"sec-date-@@custommatcher":["_ref_69"],"sec-string-@@custommatcher":["_ref_70"],"sec-static-semantics-capturinggroupname":["_ref_71","_ref_312"],"sec-regexpcreate":["_ref_72","_ref_73","_ref_74"],"sec-regexpinitialize":["_ref_75","_ref_76","_ref_77","_ref_313"],"sec-regexp-regular-expression-objects":["_ref_78","_ref_79"],"sec-regexp-pattern-flags":["_ref_80"],"sec-regexp-@@custommatcher":["_ref_81","_ref_82"],"sec-regexp.prototype-@@custommatcher":["_ref_83","_ref_84","_ref_85"],"sec-array-@@custommatcher":["_ref_86"],"sec-_typedarray_-@@custommatcher":["_ref_87"],"sec-map-@@custommatcher":["_ref_88"],"sec-set-@@custommatcher":["_ref_89"],"sec-weakmap-@@custommatcher":["_ref_90"],"sec-weakset-@@custommatcher":["_ref_91"],"sec-arraybuffer-@@custommatcher":["_ref_92"],"sec-sharedarraybuffer-@@custommatcher":["_ref_93"],"sec-dataview-@@custommatcher":["_ref_94"],"sec-weakref-@@custommatcher":["_ref_95"],"sec-finalizationregistry-@@custommatcher":["_ref_96"],"sec-promise-@@custommatcher":["_ref_97"],"sec-proxy-constructor":["_ref_98"],"sec-match-patterns-static-semantics-early-errors":["_ref_99","_ref_100","_ref_101","_ref_102","_ref_401","_ref_402","_ref_403","_ref_404","_ref_405","_ref_406","_ref_407","_ref_408","_ref_409","_ref_410","_ref_411","_ref_412","_ref_413","_ref_414","_ref_415","_ref_416","_ref_417","_ref_418","_ref_419","_ref_420","_ref_421","_ref_422","_ref_423","_ref_424","_ref_425","_ref_426","_ref_427","_ref_428","_ref_429","_ref_430"],"sec-is-optional-pattern":["_ref_103","_ref_104","_ref_105","_ref_106","_ref_431","_ref_432","_ref_433","_ref_434","_ref_435","_ref_436","_ref_437","_ref_438","_ref_439"],"sec-match-pattern-matches":["_ref_107","_ref_108","_ref_109","_ref_110","_ref_111","_ref_112","_ref_113","_ref_114","_ref_115","_ref_116","_ref_117","_ref_118","_ref_440","_ref_441","_ref_442","_ref_443","_ref_444","_ref_445","_ref_446","_ref_447","_ref_448","_ref_449","_ref_450","_ref_451","_ref_452","_ref_453","_ref_454","_ref_455","_ref_456","_ref_457","_ref_458","_ref_459","_ref_460","_ref_461"],"sec-primitive-pattern-matches":["_ref_119"],"sec-binding-pattern-matches":["_ref_120","_ref_462","_ref_463"],"sec-member-expression-pattern-matches":["_ref_127","_ref_128","_ref_129","_ref_130","_ref_131","_ref_472","_ref_473","_ref_474","_ref_475","_ref_476","_ref_477","_ref_478"],"sec-object-pattern-matches":["_ref_132","_ref_133","_ref_134","_ref_135","_ref_136","_ref_479","_ref_480","_ref_481","_ref_482","_ref_483","_ref_484","_ref_485","_ref_486","_ref_487"],"sec-object-pattern-inner-matches":["_ref_137","_ref_138","_ref_139","_ref_140","_ref_141","_ref_142","_ref_143","_ref_144","_ref_145","_ref_146","_ref_147","_ref_148","_ref_149","_ref_488","_ref_489","_ref_490","_ref_491","_ref_492","_ref_493","_ref_494","_ref_495","_ref_496","_ref_497","_ref_498","_ref_499","_ref_500","_ref_501","_ref_502","_ref_503"],"sec-array-pattern-matches":["_ref_150","_ref_151","_ref_152","_ref_153","_ref_154","_ref_155","_ref_504","_ref_505","_ref_506"],"sec-list-pattern-matches":["_ref_156","_ref_157","_ref_158","_ref_159","_ref_160","_ref_161","_ref_162","_ref_163","_ref_164","_ref_165","_ref_166","_ref_507","_ref_508","_ref_509","_ref_510","_ref_511","_ref_512","_ref_513","_ref_514","_ref_515","_ref_516"],"sec-list-pattern-inner-matches":["_ref_167","_ref_168","_ref_169","_ref_170","_ref_171","_ref_172","_ref_173","_ref_174","_ref_175","_ref_517","_ref_518","_ref_519","_ref_520","_ref_521","_ref_522","_ref_523","_ref_524","_ref_525","_ref_526","_ref_527","_ref_528"],"sec-unary-algebraic-pattern-matches":["_ref_176","_ref_529","_ref_530"],"sec-relational-pattern-matches":["_ref_177","_ref_531","_ref_532","_ref_533","_ref_534","_ref_535","_ref_536","_ref_537","_ref_538","_ref_539","_ref_540","_ref_541","_ref_542","_ref_543","_ref_544","_ref_545","_ref_546","_ref_547","_ref_548","_ref_549","_ref_550"],"sec-combined-match-pattern-matches":["_ref_178","_ref_179","_ref_180","_ref_181","_ref_182","_ref_183","_ref_551","_ref_552","_ref_553","_ref_554","_ref_555","_ref_556","_ref_557","_ref_558","_ref_559","_ref_560"],"sec-match-statement-runtime-semantics-evaluation":["_ref_184","_ref_185","_ref_186","_ref_571","_ref_572","_ref_573"],"sec-match-statement-clauses-runtime-semantics-evaluation":["_ref_187","_ref_188","_ref_189","_ref_190","_ref_191","_ref_192","_ref_574","_ref_575","_ref_576","_ref_577","_ref_578","_ref_579","_ref_580","_ref_581"],"sec-match-statement-clause-runtime-semantics-evaluation":["_ref_193","_ref_194","_ref_195","_ref_582","_ref_583"],"sec-match-expression-runtime-semantics-evaluation":["_ref_196","_ref_197","_ref_198","_ref_593","_ref_594","_ref_595"],"sec-match-expression-clauses-runtime-semantics-evaluation":["_ref_199","_ref_200","_ref_201","_ref_202","_ref_203","_ref_204","_ref_205","_ref_206","_ref_596","_ref_597","_ref_598","_ref_599","_ref_600","_ref_601","_ref_602","_ref_603"],"sec-match-expression-clause-runtime-semantics-evaluation":["_ref_207","_ref_208","_ref_209","_ref_604","_ref_605"],"sec-invoke-custom-matcher":["_ref_210","_ref_211","_ref_212","_ref_213","_ref_214"],"sec-validatecustommatcherhint":["_ref_215"],"sec-get-match-cache":["_ref_216","_ref_217","_ref_218"],"sec-has-property-cached":["_ref_219","_ref_220","_ref_221"],"sec-get-cached":["_ref_222","_ref_223","_ref_224","_ref_225"],"sec-get-iterator-cached":["_ref_226","_ref_227","_ref_228","_ref_229","_ref_230","_ref_231"],"sec-iterator-step-cached":["_ref_232","_ref_233","_ref_234"],"sec-get-iterator-nth-value-cached":["_ref_235","_ref_236","_ref_237","_ref_238","_ref_239","_ref_606"],"sec-finish-list-match":["_ref_240","_ref_241","_ref_242","_ref_243","_ref_607"],"sec-finish-match":["_ref_244"],"sec-regexp.prototype.compile":["_ref_245"],"sec-todos":["_ref_246","_ref_247"],"sec-rules-of-automatic-semicolon-insertion":["_ref_248","_ref_249","_ref_250","_ref_251"],"sec-no-lineterminator-here-automatic-semicolon-insertion-list":["_ref_252","_ref_253"],"sec-primary-expression":["_ref_254"],"sec-ecmascript-language-statements-and-declarations":["_ref_262"],"sec-patterns":["_ref_289","_ref_290","_ref_291","_ref_292","_ref_293","_ref_294","_ref_295","_ref_296","_ref_297","_ref_298","_ref_299","_ref_300","_ref_301","_ref_302","_ref_303","_ref_304","_ref_305","_ref_306","_ref_307","_ref_308","_ref_309"],"sec-patterns-static-semantics-early-errors":["_ref_310","_ref_311"],"sec-parsepattern":["_ref_314","_ref_315","_ref_316","_ref_317","_ref_318","_ref_319"],"sec-match-statement-static-semantics-early-errors":["_ref_567","_ref_568","_ref_569","_ref_570"],"sec-match-expression-static-semantics-early-errors":["_ref_591","_ref_592"]},"entries":[{"type":"clause","id":"sec-todos","titleHTML":"TODOs","number":""},{"type":"clause","id":"sec-nav","titleHTML":"Introduction","number":""},{"type":"clause","id":"sec-notes-layering","titleHTML":"Layering","number":""},{"type":"clause","id":"welcome","titleHTML":"Welcome","number":""},{"type":"clause","id":"sec-organization-of-this-specification","titleHTML":"Organization of This Specification","number":"4.5"},{"type":"clause","id":"sec-overview","titleHTML":"Overview","number":"4"},{"type":"table","id":"table-1","number":1,"caption":"Table 1: Well-known Symbols"},{"type":"term","term":"@@customMatcher","refId":"sec-well-known-symbols"},{"type":"clause","id":"sec-well-known-symbols","titleHTML":"Well-Known Symbols","number":"6.1.5.1","referencingIds":["_ref_28","_ref_57","_ref_62","_ref_64","_ref_66","_ref_82","_ref_84","_ref_85","_ref_98","_ref_152","_ref_213","_ref_230"]},{"type":"clause","id":"sec-ecmascript-language-types-symbol-type","titleHTML":"The Symbol Type","number":"6.1.5","referencingIds":["_ref_59","_ref_60"]},{"type":"clause","id":"sec-object-internal-methods-and-internal-slots","titleHTML":"Object Internal Methods and Internal Slots","number":"6.1.7"},{"type":"clause","id":"sec-ecmascript-language-types","titleHTML":"ECMAScript Language Types","number":"6.1","referencingIds":["_ref_29","_ref_30","_ref_72","_ref_75","_ref_76","_ref_107","_ref_119","_ref_120","_ref_121","_ref_124","_ref_127","_ref_132","_ref_150","_ref_176","_ref_177","_ref_178","_ref_187","_ref_188","_ref_193","_ref_194","_ref_199","_ref_200","_ref_203","_ref_206","_ref_207","_ref_208","_ref_210","_ref_211","_ref_212","_ref_215","_ref_216","_ref_217","_ref_219","_ref_222","_ref_223","_ref_226","_ref_231","_ref_232","_ref_235","_ref_240"]},{"type":"op","aoid":"Type","refId":"sec-ecmascript-data-types-and-values"},{"type":"clause","id":"sec-ecmascript-data-types-and-values","titleHTML":"ECMAScript Data Types and Values","number":"6"},{"type":"term","term":"InitializeInstance","refId":"sec-initializeinstance"},{"type":"op","aoid":"InitializeInstanceElements","refId":"sec-initializeinstance"},{"type":"clause","id":"sec-initializeinstance","title":"InitializeInstanceElements ( O, constructor )","titleHTML":"InitializeInstanceElements ( <var>O</var>, <var>constructor</var> )","number":"7.3.34","referencingIds":["_ref_9"]},{"type":"clause","id":"sec-operations-on-objects","titleHTML":"Operations on Objects","number":"7.3"},{"type":"clause","id":"sec-abstract-operations","titleHTML":"Abstract Operations","number":"7"},{"type":"op","aoid":"BoundNames","refId":"sec-static-semantics-boundnames"},{"type":"clause","id":"sec-static-semantics-boundnames","titleHTML":"Static Semantics: BoundNames","number":"8.2.1","referencingIds":["_ref_71"]},{"type":"op","aoid":"DeclarationPart","refId":"sec-static-semantics-declarationpart"},{"type":"clause","id":"sec-static-semantics-declarationpart","titleHTML":"Static Semantics: DeclarationPart","number":"8.2.2"},{"type":"op","aoid":"IsConstantDeclaration","refId":"sec-static-semantics-isconstantdeclaration"},{"type":"clause","id":"sec-static-semantics-isconstantdeclaration","titleHTML":"Static Semantics: IsConstantDeclaration","number":"8.2.3"},{"type":"op","aoid":"LexicallyDeclaredNames","refId":"sec-static-semantics-lexicallydeclarednames"},{"type":"clause","id":"sec-static-semantics-lexicallydeclarednames","titleHTML":"Static Semantics: LexicallyDeclaredNames","number":"8.2.4"},{"type":"op","aoid":"LexicallyScopedDeclarations","refId":"sec-static-semantics-lexicallyscopeddeclarations"},{"type":"clause","id":"sec-static-semantics-lexicallyscopeddeclarations","titleHTML":"Static Semantics: LexicallyScopedDeclarations","number":"8.2.5"},{"type":"op","aoid":"VarDeclaredNames","refId":"sec-static-semantics-vardeclarednames"},{"type":"clause","id":"sec-static-semantics-vardeclarednames","titleHTML":"Static Semantics: VarDeclaredNames","number":"8.2.6"},{"type":"op","aoid":"VarScopedDeclarations","refId":"sec-static-semantics-varscopeddeclarations"},{"type":"clause","id":"sec-static-semantics-varscopeddeclarations","titleHTML":"Static Semantics: VarScopedDeclarations","number":"8.2.7"},{"type":"op","aoid":"TopLevelLexicallyDeclaredNames","refId":"sec-static-semantics-toplevellexicallydeclarednames"},{"type":"clause","id":"sec-static-semantics-toplevellexicallydeclarednames","titleHTML":"Static Semantics: TopLevelLexicallyDeclaredNames","number":"8.2.8"},{"type":"op","aoid":"TopLevelLexicallyScopedDeclarations","refId":"sec-static-semantics-toplevellexicallyscopeddeclarations"},{"type":"clause","id":"sec-static-semantics-toplevellexicallyscopeddeclarations","titleHTML":"Static Semantics: TopLevelLexicallyScopedDeclarations","number":"8.2.9"},{"type":"op","aoid":"TopLevelVarDeclaredNames","refId":"sec-static-semantics-toplevelvardeclarednames"},{"type":"clause","id":"sec-static-semantics-toplevelvardeclarednames","titleHTML":"Static Semantics: TopLevelVarDeclaredNames","number":"8.2.10"},{"type":"op","aoid":"TopLevelVarScopedDeclarations","refId":"sec-static-semantics-toplevelvarscopeddeclarations"},{"type":"clause","id":"sec-static-semantics-toplevelvarscopeddeclarations","titleHTML":"Static Semantics: TopLevelVarScopedDeclarations","number":"8.2.11"},{"type":"clause","id":"sec-syntax-directed-operations-scope-analysis","titleHTML":"Scope Analysis","number":"8.2"},{"type":"op","aoid":"BindingInitialization","refId":"sec-runtime-semantics-bindinginitialization"},{"type":"clause","id":"sec-runtime-semantics-bindinginitialization","titleHTML":"Runtime Semantics: BindingInitialization","number":"8.6.2"},{"type":"op","aoid":"IteratorBindingInitialization","refId":"sec-runtime-semantics-iteratorbindinginitialization"},{"type":"clause","id":"sec-runtime-semantics-iteratorbindinginitialization","titleHTML":"Runtime Semantics: IteratorBindingInitialization","number":"8.6.3"},{"type":"clause","id":"sec-syntax-directed-operations-miscellaneous","titleHTML":"Miscellaneous","number":"8.6"},{"type":"clause","id":"sec-syntax-directed-operations","titleHTML":"Syntax-Directed Operations","number":"8","referencingIds":["_ref_8"]},{"type":"clause","id":"sec-weakly-hold-execution","titleHTML":"Execution","number":"9.10.3"},{"type":"clause","id":"sec-weakly-hold-targets-processing-model","title":"Processing Model of WeakRef and FinalizationRegistryweakly hold Targets","titleHTML":"Processing Model of <del>WeakRef and FinalizationRegistry</del><ins>weakly hold</ins> Targets","number":"9.10","referencingIds":["_ref_10"]},{"type":"clause","id":"sec-executable-code-and-execution-contexts","titleHTML":"Executable Code and Execution Contexts","number":"9"},{"type":"clause","id":"sec-rules-of-automatic-semicolon-insertion","titleHTML":"Rules of Automatic Semicolon Insertion","number":"12.10.1"},{"type":"clause","id":"sec-no-lineterminator-here-automatic-semicolon-insertion-list","title":"List of Grammar Productions with Optional Operands and “[no LineTerminator here]”","titleHTML":"List of Grammar Productions with Optional Operands and “[no <emu-nt>LineTerminator</emu-nt> here]”","number":"12.10.3.2.1"},{"type":"clause","id":"sec-asi-cases-with-no-lineterminator-here","title":"Cases of Automatic Semicolon Insertion and “[no LineTerminator here]”","titleHTML":"Cases of Automatic Semicolon Insertion and “[no <emu-nt>LineTerminator</emu-nt> here]”","number":"12.10.3.2"},{"type":"clause","id":"sec-interesting-cases-of-automatic-semicolon-insertion","titleHTML":"Interesting Cases of Automatic Semicolon Insertion","number":"12.10.3"},{"type":"clause","id":"sec-automatic-semicolon-insertion","titleHTML":"Automatic Semicolon Insertion","number":"12.10"},{"type":"clause","id":"sec-ecmascript-language-lexical-grammar","titleHTML":"ECMAScript Language: Lexical Grammar","number":"12"},{"type":"production","id":"prod-PrimaryExpression","name":"PrimaryExpression"},{"type":"clause","id":"sec-primary-expression-regular-expression-literals-static-semantics-early-errors","titleHTML":"Static Semantics: Early Errors","number":"13.2.7.1"},{"type":"op","aoid":"IsValidRegularExpressionLiteral","refId":"sec-isvalidregularexpressionliteral"},{"type":"clause","id":"sec-isvalidregularexpressionliteral","title":"Static Semantics: IsValidRegularExpressionLiteral ( literal, canCreateBinding )","titleHTML":"Static Semantics: IsValidRegularExpressionLiteral ( <var>literal</var>, <ins><var>canCreateBinding</var></ins> )","number":"13.2.7.2","referencingIds":["_ref_31","_ref_102"]},{"type":"clause","id":"sec-primary-expression-regular-expression-literals","titleHTML":"Regular Expression Literals","number":"13.2.7"},{"type":"clause","id":"sec-primary-expression-match-expression","titleHTML":"Match Expression","number":"13.2.10"},{"type":"clause","id":"sec-primary-expression","titleHTML":"Primary Expression","number":"13.2"},{"type":"production","id":"prod-RelationalExpression","name":"RelationalExpression","referencingIds":["_ref_248","_ref_256","_ref_258","_ref_260","_ref_263"]},{"type":"clause","id":"sec-relational-operators-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: Evaluation","number":"13.10.1"},{"type":"clause","id":"sec-relational-operators","titleHTML":"Relational Operators","number":"13.10","referencingIds":["_ref_3","_ref_25","_ref_26"]},{"type":"clause","id":"sec-ecmascript-language-expressions","titleHTML":"ECMAScript Language: Expressions","number":"13"},{"type":"clause","id":"sec-for-in-and-for-of-statements","title":"The for-in, for-of, and for-await-of Statements","titleHTML":"The <code>for</code>-<code>in</code>, <code>for</code>-<code>of</code>, and <code>for</code>-<code>await</code>-<code>of</code> Statements","number":"14.7.1","referencingIds":["_ref_14"]},{"type":"clause","id":"sec-iteration-statements","titleHTML":"Iteration Statements","number":"14.7"},{"type":"clause","id":"sec-try-statement","title":"The try Statement","titleHTML":"The <code>try</code> Statement","number":"14.14","referencingIds":["_ref_15"]},{"type":"clause","id":"sec-the-match-statement","title":"The match Statement","titleHTML":"The <code>match</code> Statement","number":"14.17"},{"type":"clause","id":"sec-ecmascript-language-statements-and-declarations","titleHTML":"ECMAScript Language: Statements and Declarations","number":"14"},{"type":"op","aoid":"ClassDefinitionEvaluation","refId":"sec-runtime-semantics-classdefinitionevaluation"},{"type":"clause","id":"sec-runtime-semantics-classdefinitionevaluation","titleHTML":"Runtime Semantics: ClassDefinitionEvaluation","number":"15.7.14","referencingIds":["_ref_11"]},{"type":"clause","id":"sec-class-definitions","titleHTML":"Class Definitions","number":"15.7"},{"type":"op","aoid":"HasCallInTailPosition","refId":"sec-static-semantics-hascallintailposition"},{"type":"clause","id":"sec-static-semantics-hascallintailposition","titleHTML":"Static Semantics: HasCallInTailPosition","number":"15.10.2","referencingIds":["_ref_36","_ref_37","_ref_38","_ref_39","_ref_40","_ref_41","_ref_42","_ref_43","_ref_44","_ref_45","_ref_46","_ref_47","_ref_48","_ref_49","_ref_50","_ref_51","_ref_52"]},{"type":"clause","id":"sec-tail-position-calls","titleHTML":"Tail Position Calls","number":"15.10"},{"type":"clause","id":"sec-ecmascript-language-functions-and-classes","titleHTML":"ECMAScript Language: Functions and Classes","number":"15"},{"type":"clause","id":"sec-object-@@custommatcher","title":"Object [ @@customMatcher ] ( subject, hint )","titleHTML":"Object [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.1.2.24"},{"type":"clause","id":"sec-properties-of-the-object-constructor","titleHTML":"Properties of the Object Constructor","number":"20.1.2"},{"type":"clause","id":"sec-object-objects","titleHTML":"Object Objects","number":"20.1"},{"type":"clause","id":"sec-function-@@custommatcher","title":"Function [ @@customMatcher ] ( subject, hint )","titleHTML":"Function [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.2.2.2"},{"type":"clause","id":"sec-properties-of-the-function-constructor","titleHTML":"Properties of the Function Constructor","number":"20.2.2"},{"type":"clause","id":"sec-function.prototype-@@custommatcher","title":"Function.prototype [ @@customMatcher ] ( subject, hint, receiver )","titleHTML":"Function.prototype [ @@customMatcher ] ( <var>subject</var>, <var>hint</var>, <var>receiver</var> )","number":"20.2.3.7","referencingIds":["_ref_6"]},{"type":"clause","id":"sec-properties-of-the-function-prototype-object","titleHTML":"Properties of the Function Prototype Object","number":"20.2.3"},{"type":"clause","id":"sec-function-objects","titleHTML":"Function Objects","number":"20.2"},{"type":"clause","id":"sec-boolean-@@custommatcher","title":"Boolean [ @@customMatcher ] ( subject, hint )","titleHTML":"Boolean [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.3.2.2"},{"type":"clause","id":"sec-properties-of-the-boolean-constructor","titleHTML":"Properties of the Boolean Constructor","number":"20.3.2"},{"type":"clause","id":"sec-boolean-objects","titleHTML":"Boolean Objects","number":"20.3"},{"type":"clause","id":"sec-symbol.custommatcher","titleHTML":"Symbol.customMatcher","number":"20.4.2.17"},{"type":"clause","id":"sec-symbol-@@custommatcher","title":"Symbol [ @@customMatcher ] ( subject, hint )","titleHTML":"Symbol [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.4.2.18"},{"type":"clause","id":"sec-properties-of-the-symbol-constructor","titleHTML":"Properties of the Symbol Constructor","number":"20.4.2"},{"type":"clause","id":"sec-symbol-objects","titleHTML":"Symbol Objects","number":"20.4"},{"type":"clause","id":"sec-error-message","title":"Error ( message [ , options ] )","titleHTML":"Error ( <var>message</var> [ , <var>options</var> ] )","number":"20.5.1.1"},{"type":"clause","id":"sec-error-constructor","titleHTML":"The Error Constructor","number":"20.5.1"},{"type":"clause","id":"sec-error-@@custommatcher","title":"Error [ @@customMatcher ] ( subject, hint )","titleHTML":"Error [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.5.2.2"},{"type":"clause","id":"sec-properties-of-the-error-constructors","titleHTML":"Properties of the Error Constructor","number":"20.5.2"},{"type":"clause","id":"sec-properties-of-error-instances","titleHTML":"Properties of Error Instances","number":"20.5.4"},{"type":"clause","id":"sec-nativeerror","title":"NativeError ( message [ , options ] )","titleHTML":"<var>NativeError</var> ( <var>message</var> [ , <var>options</var> ] )","number":"20.5.6.1.1"},{"type":"clause","id":"sec-nativeerror-constructors","title":"The NativeError Constructors","titleHTML":"The <var>NativeError</var> Constructors","number":"20.5.6.1"},{"type":"clause","id":"sec-nativeerror-@@custommatcher","title":"NativeError [ @@customMatcher ] ( subject, hint )","titleHTML":"<var>NativeError</var> [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.5.6.2.2"},{"type":"clause","id":"sec-properties-of-the-nativeerror-constructors","title":"Properties of the NativeError Constructors","titleHTML":"Properties of the <var>NativeError</var> Constructors","number":"20.5.6.2"},{"type":"clause","id":"sec-properties-of-nativeerror-instances","title":"Properties of NativeError Instances","titleHTML":"Properties of <var>NativeError</var> Instances","number":"20.5.6.4"},{"type":"clause","id":"sec-nativeerror-object-structure","title":"NativeError Object Structure","titleHTML":"<var>NativeError</var> Object Structure","number":"20.5.6"},{"type":"clause","id":"sec-aggregate-error","title":"AggregateError ( errors, message [ , options ] )","titleHTML":"AggregateError ( <var>errors</var>, <var>message</var> [ , <var>options</var> ] )","number":"20.5.7.1.1"},{"type":"clause","id":"sec-aggregate-error-constructor","titleHTML":"The AggregateError Constructor","number":"20.5.7.1"},{"type":"clause","id":"sec-aggregate-error-@@custommatcher","title":"AggregateError [ @@customMatcher ] ( subject, hint )","titleHTML":"AggregateError [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"20.5.7.2.2"},{"type":"clause","id":"sec-properties-of-the-aggregate-error-constructors","titleHTML":"Properties of the AggregateError Constructor","number":"20.5.7.2"},{"type":"clause","id":"sec-properties-of-aggregate-error-instances","titleHTML":"Properties of AggregateError Instances","number":"20.5.7.4"},{"type":"clause","id":"sec-aggregate-error-objects","titleHTML":"AggregateError Objects","number":"20.5.7"},{"type":"clause","id":"sec-error-objects","titleHTML":"Error Objects","number":"20.5"},{"type":"clause","id":"sec-fundamental-objects","titleHTML":"Fundamental Objects","number":"20"},{"type":"clause","id":"sec-number-@@custommatcher","title":"Number [ @@customMatcher ] ( subject, hint )","titleHTML":"Number [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"21.1.2.16"},{"type":"clause","id":"sec-properties-of-the-number-constructor","titleHTML":"Properties of the Number Constructor","number":"21.1.2"},{"type":"clause","id":"sec-number-objects","titleHTML":"Number Objects","number":"21.1"},{"type":"clause","id":"sec-bigint-@@custommatcher","title":"BigInt [ @@customMatcher ] ( subject, hint )","titleHTML":"BigInt [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"21.2.2.4"},{"type":"clause","id":"sec-properties-of-the-bigint-constructor","titleHTML":"Properties of the BigInt Constructor","number":"21.2.2"},{"type":"clause","id":"sec-bigint-objects","titleHTML":"BigInt Objects","number":"21.2"},{"type":"clause","id":"sec-date-@@custommatcher","title":"Date [ @@customMatcher ] ( subject, hint )","titleHTML":"Date [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"21.4.3.5"},{"type":"clause","id":"sec-properties-of-the-date-constructor","titleHTML":"Properties of the Date Constructor","number":"21.4.3"},{"type":"clause","id":"sec-date-objects","titleHTML":"Date Objects","number":"21.4"},{"type":"clause","id":"sec-numbers-and-dates","titleHTML":"Numbers and Dates","number":"21"},{"type":"clause","id":"sec-string-@@custommatcher","title":"String [ @@customMatcher ] ( subject, hint )","titleHTML":"String [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"22.1.2.5","referencingIds":["_ref_20"]},{"type":"clause","id":"sec-properties-of-the-string-constructor","titleHTML":"Properties of the String Constructor","number":"22.1.2"},{"type":"clause","id":"sec-string-objects","titleHTML":"String Objects","number":"22.1"},{"type":"production","id":"prod-Pattern","name":"Pattern","referencingIds":["_ref_309","_ref_313","_ref_314","_ref_315","_ref_316","_ref_317","_ref_318","_ref_319"]},{"type":"production","id":"prod-Disjunction","name":"Disjunction","referencingIds":["_ref_289","_ref_292","_ref_298","_ref_299","_ref_300","_ref_301","_ref_304","_ref_305"]},{"type":"production","id":"prod-Alternative","name":"Alternative","referencingIds":["_ref_290","_ref_291","_ref_293"]},{"type":"production","id":"prod-Term","name":"Term","referencingIds":["_ref_294"]},{"type":"production","id":"prod-Assertion","name":"Assertion","referencingIds":["_ref_295"]},{"type":"production","id":"prod-Atom","name":"Atom","referencingIds":["_ref_296","_ref_297"]},{"type":"production","id":"prod-AtomEscape","name":"AtomEscape","referencingIds":["_ref_302"]},{"type":"production","id":"prod-GroupSpecifier","name":"GroupSpecifier","referencingIds":["_ref_303","_ref_417","_ref_419","_ref_465","_ref_467"]},{"type":"production","id":"prod-GroupName","name":"GroupName","referencingIds":["_ref_306","_ref_307","_ref_466"]},{"type":"clause","id":"sec-patterns-static-semantics-early-errors","titleHTML":"Static Semantics: Early Errors","number":"22.2.1.1"},{"type":"op","aoid":"CapturingGroupName","refId":"sec-static-semantics-capturinggroupname"},{"type":"clause","id":"sec-static-semantics-capturinggroupname","titleHTML":"Static Semantics: CapturingGroupName","number":"22.2.1.9","referencingIds":["_ref_125"]},{"type":"clause","id":"sec-patterns","titleHTML":"Patterns","number":"22.2.1","referencingIds":["_ref_12"]},{"type":"op","aoid":"RegExpCreate","refId":"sec-regexpcreate"},{"type":"clause","id":"sec-regexpcreate","title":"RegExpCreate ( P, F )","titleHTML":"RegExpCreate ( <var>P</var>, <var>F</var> )","number":"22.2.3.1","referencingIds":["_ref_78","_ref_79"]},{"type":"op","aoid":"RegExpInitialize","refId":"sec-regexpinitialize"},{"type":"clause","id":"sec-regexpinitialize","title":"RegExpInitialize ( obj, pattern, flags, canCreateBinding )","titleHTML":"RegExpInitialize ( <var>obj</var>, <var>pattern</var>, <var>flags</var>, <ins><var>canCreateBinding</var></ins> )","number":"22.2.3.3","referencingIds":["_ref_74","_ref_80","_ref_123","_ref_245"]},{"type":"op","aoid":"ParsePattern","refId":"sec-parsepattern"},{"type":"clause","id":"sec-parsepattern","title":"Static Semantics: ParsePattern ( patternText, u, v, canCreateBinding )","titleHTML":"Static Semantics: ParsePattern ( <var>patternText</var>, <var>u</var>, <var>v</var>, <ins><var>canCreateBinding</var></ins> )","number":"22.2.3.4","referencingIds":["_ref_27","_ref_32","_ref_77"]},{"type":"clause","id":"sec-abstract-operations-for-regexp-creation","titleHTML":"Abstract Operations for RegExp Creation","number":"22.2.3"},{"type":"clause","id":"sec-regexp-pattern-flags","title":"RegExp ( pattern, flags )","titleHTML":"RegExp ( <var>pattern</var>, <var>flags</var> )","number":"22.2.4.1"},{"type":"clause","id":"sec-regexp-constructor","titleHTML":"The RegExp Constructor","number":"22.2.4","referencingIds":["_ref_24","_ref_73","_ref_122"]},{"type":"clause","id":"sec-regexp-@@custommatcher","title":"RegExp [ @@customMatcher ] ( subject, hint )","titleHTML":"RegExp [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"22.2.5.3"},{"type":"clause","id":"sec-properties-of-the-regexp-constructor","titleHTML":"Properties of the RegExp Constructor","number":"22.2.5"},{"type":"clause","id":"sec-regexp.prototype-@@custommatcher","title":"RegExp.prototype [ @@customMatcher ] ( subject, hint )","titleHTML":"RegExp.prototype [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"22.2.6.20","referencingIds":["_ref_7","_ref_21","_ref_22","_ref_23"]},{"type":"clause","id":"sec-properties-of-the-regexp-prototype-object","titleHTML":"Properties of the RegExp Prototype Object","number":"22.2.6"},{"type":"clause","id":"sec-regexp-regular-expression-objects","titleHTML":"RegExp (Regular Expression) Objects","number":"22.2"},{"type":"clause","id":"sec-text-processing","titleHTML":"Text Processing","number":"22"},{"type":"clause","id":"sec-array-@@custommatcher","title":"Array [ @@customMatcher ] ( subject, hint )","titleHTML":"Array [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"23.1.2.6"},{"type":"clause","id":"sec-properties-of-the-array-constructor","titleHTML":"Properties of the Array Constructor","number":"23.1.2"},{"type":"clause","id":"sec-array-objects","titleHTML":"Array Objects","number":"23.1"},{"type":"clause","id":"sec-_typedarray_-@@custommatcher","title":"TypedArray [ @@customMatcher ] ( subject, hint )","titleHTML":"<var>TypedArray</var> [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"23.2.6.3"},{"type":"clause","id":"sec-properties-of-the-typedarray-constructors","title":"Properties of the TypedArray Constructors","titleHTML":"Properties of the <var>TypedArray</var> Constructors","number":"23.2.6"},{"type":"clause","id":"sec-typedarray-objects","titleHTML":"TypedArray Objects","number":"23.2"},{"type":"clause","id":"sec-indexed-collections","titleHTML":"Indexed Collections","number":"23"},{"type":"clause","id":"sec-map-@@custommatcher","title":"Map [ @@customMatcher ] ( subject, hint )","titleHTML":"Map [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"24.1.2.3"},{"type":"clause","id":"sec-properties-of-the-map-constructor","titleHTML":"Properties of the Map Constructor","number":"24.1.2"},{"type":"clause","id":"sec-map-objects","titleHTML":"Map Objects","number":"24.1"},{"type":"clause","id":"sec-set-@@custommatcher","title":"Set [ @@customMatcher ] ( subject, hint )","titleHTML":"Set [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"24.2.2.3"},{"type":"clause","id":"sec-properties-of-the-set-constructor","titleHTML":"Properties of the Set Constructor","number":"24.2.2"},{"type":"clause","id":"sec-set-objects","titleHTML":"Set Objects","number":"24.2"},{"type":"clause","id":"sec-weakmap-@@custommatcher","title":"WeakMap [ @@customMatcher ] ( subject, hint )","titleHTML":"WeakMap [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"24.3.2.2"},{"type":"clause","id":"sec-properties-of-the-weakmap-constructor","titleHTML":"Properties of the WeakMap Constructor","number":"24.3.2"},{"type":"clause","id":"sec-weakmap-objects","titleHTML":"WeakMap Objects","number":"24.3"},{"type":"clause","id":"sec-weakset-@@custommatcher","title":"WeakSet [ @@customMatcher ] ( subject, hint )","titleHTML":"WeakSet [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"24.4.2.2"},{"type":"clause","id":"sec-properties-of-the-weakset-constructor","titleHTML":"Properties of the WeakSet Constructor","number":"24.4.2"},{"type":"clause","id":"sec-weakset-objects","titleHTML":"WeakSet Objects","number":"24.4"},{"type":"clause","id":"sec-keyed-collections","titleHTML":"Keyed Collections","number":"24"},{"type":"clause","id":"sec-arraybuffer-@@custommatcher","title":"ArrayBuffer [ @@customMatcher ] ( subject, hint )","titleHTML":"ArrayBuffer [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"25.1.5.4"},{"type":"clause","id":"sec-properties-of-the-arraybuffer-constructor","titleHTML":"Properties of the ArrayBuffer Constructor","number":"25.1.5"},{"type":"clause","id":"sec-arraybuffer-objects","titleHTML":"ArrayBuffer Objects","number":"25.1"},{"type":"clause","id":"sec-sharedarraybuffer-@@custommatcher","title":"SharedArrayBuffer [ @@customMatcher ] ( subject, hint )","titleHTML":"SharedArrayBuffer [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"25.2.4.3"},{"type":"clause","id":"sec-properties-of-the-sharedarraybuffer-constructor","titleHTML":"Properties of the SharedArrayBuffer Constructor","number":"25.2.4"},{"type":"clause","id":"sec-sharedarraybuffer-objects","titleHTML":"SharedArrayBuffer Objects","number":"25.2"},{"type":"clause","id":"sec-dataview-@@custommatcher","title":"DataView [ @@customMatcher ] ( subject, hint )","titleHTML":"DataView [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"25.3.3.2"},{"type":"clause","id":"sec-properties-of-the-dataview-constructor","titleHTML":"Properties of the DataView Constructor","number":"25.3.3"},{"type":"clause","id":"sec-dataview-objects","titleHTML":"DataView Objects","number":"25.3"},{"type":"clause","id":"sec-structured-data","titleHTML":"Structured Data","number":"25"},{"type":"clause","id":"sec-weakref-@@custommatcher","title":"WeakRef [ @@customMatcher ] ( subject, hint )","titleHTML":"WeakRef [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"26.1.2.2"},{"type":"clause","id":"sec-properties-of-the-weak-ref-constructor","titleHTML":"Properties of the WeakRef Constructor","number":"26.1.2"},{"type":"clause","id":"sec-weak-ref-objects","titleHTML":"WeakRef Objects","number":"26.1"},{"type":"clause","id":"sec-finalizationregistry-@@custommatcher","title":"FinalizationRegistry [ @@customMatcher ] ( subject, hint )","titleHTML":"FinalizationRegistry [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"26.2.2.2"},{"type":"clause","id":"sec-properties-of-the-finalization-registry-constructor","titleHTML":"Properties of the FinalizationRegistry Constructor","number":"26.2.2"},{"type":"clause","id":"sec-finalization-registry-objects","titleHTML":"FinalizationRegistry Objects","number":"26.2"},{"type":"clause","id":"sec-managing-memory","titleHTML":"Managing Memory","number":"26"},{"type":"clause","id":"sec-promise-@@custommatcher","title":"Promise [ @@customMatcher ] ( subject, hint )","titleHTML":"Promise [ @@customMatcher ] ( <var>subject</var>, <var>hint</var> )","number":"27.2.4.9"},{"type":"clause","id":"sec-properties-of-the-promise-constructor","titleHTML":"Properties of the Promise Constructor","number":"27.2.4"},{"type":"clause","id":"sec-promise-objects","titleHTML":"Promise Objects","number":"27.2"},{"type":"clause","id":"sec-control-abstraction-objects","titleHTML":"Control Abstraction Objects","number":"27"},{"type":"clause","id":"sec-proxy-@@custommatcher","titleHTML":"Proxy [ @@customMatcher ] ( )","number":"28.2.1.2"},{"type":"clause","id":"sec-proxy-constructor","titleHTML":"The Proxy Constructor","number":"28.2.1"},{"type":"clause","id":"sec-proxy-objects","titleHTML":"Proxy Objects","number":"28.2"},{"type":"clause","id":"sec-reflection","titleHTML":"Reflection","number":"28"},{"type":"production","id":"prod-MatchPattern","name":"MatchPattern","referencingIds":["_ref_249","_ref_257","_ref_259","_ref_261","_ref_264","_ref_277","_ref_288","_ref_320","_ref_352","_ref_360","_ref_363","_ref_364","_ref_365","_ref_372","_ref_396","_ref_397","_ref_398","_ref_399","_ref_400","_ref_403","_ref_404","_ref_405","_ref_406","_ref_408","_ref_420","_ref_421","_ref_422","_ref_424","_ref_425","_ref_426","_ref_428","_ref_429","_ref_439","_ref_440","_ref_441","_ref_488","_ref_489","_ref_496","_ref_497","_ref_501","_ref_502","_ref_525","_ref_526","_ref_527","_ref_528","_ref_551","_ref_552","_ref_553","_ref_554","_ref_555","_ref_556","_ref_557","_ref_558","_ref_559","_ref_560","_ref_566","_ref_570","_ref_582","_ref_583","_ref_589","_ref_604","_ref_605"]},{"type":"production","id":"prod-PrimitivePattern","name":"PrimitivePattern","referencingIds":["_ref_321","_ref_442","_ref_443"]},{"type":"production","id":"prod-BindingPattern","name":"BindingPattern","referencingIds":["_ref_322","_ref_444","_ref_445"]},{"type":"production","id":"prod-VarOrLetOrConst","name":"VarOrLetOrConst","referencingIds":["_ref_308","_ref_310","_ref_311","_ref_312","_ref_331","_ref_361","_ref_362","_ref_371","_ref_373","_ref_401","_ref_402","_ref_418","_ref_462","_ref_463","_ref_468","_ref_498","_ref_499","_ref_500","_ref_503"]},{"type":"production","id":"prod-RegularExpressionPattern","name":"RegularExpressionPattern","referencingIds":["_ref_323","_ref_446","_ref_447","_ref_469"]},{"type":"production","id":"prod-MemberExpressionPattern","name":"MemberExpressionPattern","referencingIds":["_ref_324","_ref_407","_ref_448","_ref_449"]},{"type":"production","id":"prod-PatternMatchingMemberExpression","name":"PatternMatchingMemberExpression","referencingIds":["_ref_333","_ref_334","_ref_336","_ref_337","_ref_338","_ref_339","_ref_340","_ref_341","_ref_342","_ref_375","_ref_376","_ref_381","_ref_382","_ref_387","_ref_393","_ref_472","_ref_473","_ref_474","_ref_476","_ref_539","_ref_540","_ref_541","_ref_542"]},{"type":"production","id":"prod-ObjectPattern","name":"ObjectPattern","referencingIds":["_ref_325","_ref_450","_ref_451"]},{"type":"production","id":"prod-ArrayPattern","name":"ArrayPattern","referencingIds":["_ref_326","_ref_452","_ref_453"]},{"type":"production","id":"prod-MatchList","name":"MatchList","referencingIds":["_ref_332","_ref_335","_ref_347","_ref_416","_ref_464","_ref_470","_ref_471","_ref_475","_ref_477","_ref_478","_ref_504","_ref_505","_ref_506","_ref_606","_ref_607"]},{"type":"production","id":"prod-MatchRestProperty","name":"MatchRestProperty","referencingIds":["_ref_343","_ref_346","_ref_479","_ref_480","_ref_484","_ref_486","_ref_487"]},{"type":"production","id":"prod-MatchPropertyList","name":"MatchPropertyList","referencingIds":["_ref_344","_ref_345","_ref_354","_ref_481","_ref_482","_ref_483","_ref_485","_ref_492","_ref_495"]},{"type":"production","id":"prod-MatchElementList","name":"MatchElementList","referencingIds":["_ref_349","_ref_350","_ref_357","_ref_409","_ref_411","_ref_412","_ref_414","_ref_433","_ref_435","_ref_510","_ref_511","_ref_512","_ref_514","_ref_519","_ref_521"]},{"type":"production","id":"prod-MatchElisionElement","name":"MatchElisionElement","referencingIds":["_ref_356","_ref_358","_ref_413","_ref_415","_ref_431","_ref_432","_ref_434","_ref_436","_ref_517","_ref_518","_ref_520","_ref_522"]},{"type":"production","id":"prod-MatchProperty","name":"MatchProperty","referencingIds":["_ref_353","_ref_355","_ref_366","_ref_367","_ref_369","_ref_490","_ref_491","_ref_493","_ref_494"]},{"type":"production","id":"prod-MatchElement","name":"MatchElement","referencingIds":["_ref_359","_ref_368","_ref_370","_ref_437","_ref_438","_ref_523","_ref_524"]},{"type":"production","id":"prod-MatchRestElement","name":"MatchRestElement","referencingIds":["_ref_348","_ref_351","_ref_410","_ref_507","_ref_508","_ref_509","_ref_513","_ref_515","_ref_516"]},{"type":"production","id":"prod-UnaryAlgebraicPattern","name":"UnaryAlgebraicPattern","referencingIds":["_ref_327","_ref_454","_ref_455"]},{"type":"production","id":"prod-PatternMatchingUnaryAlgebraicExpression","name":"PatternMatchingUnaryAlgebraicExpression","referencingIds":["_ref_374","_ref_388","_ref_529","_ref_530"]},{"type":"production","id":"prod-RelationalPattern","name":"RelationalPattern"},{"type":"production","id":"prod-PatternMatchingRelationalExpression","name":"PatternMatchingRelationalExpression","referencingIds":["_ref_377","_ref_378","_ref_379","_ref_380","_ref_383","_ref_384","_ref_385","_ref_386","_ref_395","_ref_531","_ref_532","_ref_533","_ref_534","_ref_535","_ref_536","_ref_537","_ref_538","_ref_543","_ref_544","_ref_545","_ref_546","_ref_547","_ref_548","_ref_549","_ref_550"]},{"type":"production","id":"prod-RelationalPattern","name":"RelationalPattern","referencingIds":["_ref_328","_ref_456","_ref_457"]},{"type":"production","id":"prod-PatternMatchingStringLikeExpression","name":"PatternMatchingStringLikeExpression","referencingIds":["_ref_389","_ref_390","_ref_391","_ref_392","_ref_394"]},{"type":"production","id":"prod-IfPattern","name":"IfPattern","referencingIds":["_ref_329","_ref_458","_ref_459"]},{"type":"production","id":"prod-CombinedMatchPattern","name":"CombinedMatchPattern","referencingIds":["_ref_330","_ref_423","_ref_427","_ref_430","_ref_460","_ref_461"]},{"type":"clause","id":"sec-match-patterns-static-semantics-early-errors","titleHTML":"Static Semantics: Early Errors","number":"30.1.1"},{"type":"op","aoid":"IsOptionalPattern","refId":"sec-is-optional-pattern"},{"type":"clause","id":"sec-is-optional-pattern","titleHTML":"Static Semantics: IsOptionalPattern","number":"30.1.2","referencingIds":["_ref_99","_ref_100","_ref_101","_ref_103","_ref_104","_ref_105","_ref_106"]},{"type":"op","aoid":"MatchPatternMatches","refId":"sec-match-pattern-matches"},{"type":"clause","id":"sec-match-pattern-matches","titleHTML":"Runtime Semantics: MatchPatternMatches","number":"30.1.3","referencingIds":["_ref_34","_ref_108","_ref_137","_ref_144","_ref_149","_ref_173","_ref_175","_ref_179","_ref_180","_ref_181","_ref_182","_ref_183","_ref_195","_ref_209"]},{"type":"op","aoid":"PrimitivePatternMatches","refId":"sec-primitive-pattern-matches"},{"type":"clause","id":"sec-primitive-pattern-matches","titleHTML":"Runtime Semantics: PrimitivePatternMatches","number":"30.1.4","referencingIds":["_ref_109"]},{"type":"op","aoid":"BindingPatternMatches","refId":"sec-binding-pattern-matches"},{"type":"clause","id":"sec-binding-pattern-matches","titleHTML":"Runtime Semantics: BindingPatternMatches","number":"30.1.5","referencingIds":["_ref_110"]},{"type":"op","aoid":"RegularExpressionPatternMatches","refId":"sec-regular-expression-pattern-matches"},{"type":"clause","id":"sec-regular-expression-pattern-matches","titleHTML":"Runtime Semantics: RegularExpressionPatternMatches","number":"30.1.6","referencingIds":["_ref_13","_ref_111"]},{"type":"op","aoid":"MemberExpressionPatternMatches","refId":"sec-member-expression-pattern-matches"},{"type":"clause","id":"sec-member-expression-pattern-matches","titleHTML":"Runtime Semantics: MemberExpressionPatternMatches","number":"30.1.7","referencingIds":["_ref_112"]},{"type":"op","aoid":"ObjectPatternMatches","refId":"sec-object-pattern-matches"},{"type":"clause","id":"sec-object-pattern-matches","titleHTML":"Runtime Semantics: ObjectPatternMatches","number":"30.1.8","referencingIds":["_ref_113"]},{"type":"op","aoid":"ObjectPatternInnerMatches","refId":"sec-object-pattern-inner-matches"},{"type":"clause","id":"sec-object-pattern-inner-matches","titleHTML":"Runtime Semantics: ObjectPatternInnerMatches","number":"30.1.9","referencingIds":["_ref_133","_ref_134","_ref_135","_ref_136","_ref_138","_ref_139","_ref_140"]},{"type":"op","aoid":"ArrayPatternMatches","refId":"sec-array-pattern-matches"},{"type":"clause","id":"sec-array-pattern-matches","titleHTML":"Runtime Semantics: ArrayPatternMatches","number":"30.1.10","referencingIds":["_ref_114"]},{"type":"op","aoid":"ListPatternMatches","refId":"sec-list-pattern-matches"},{"type":"clause","id":"sec-list-pattern-matches","titleHTML":"Runtime Semantics: ListPatternMatches","number":"30.1.11","referencingIds":["_ref_126","_ref_131","_ref_155"]},{"type":"op","aoid":"ListPatternInnerMatches","refId":"sec-list-pattern-inner-matches"},{"type":"clause","id":"sec-list-pattern-inner-matches","titleHTML":"Runtime Semantics: ListPatternInnerMatches","number":"30.1.12","referencingIds":["_ref_157","_ref_160","_ref_162","_ref_164","_ref_167","_ref_168","_ref_169","_ref_171"]},{"type":"op","aoid":"UnaryAlgebraicPatternMatches","refId":"sec-unary-algebraic-pattern-matches"},{"type":"clause","id":"sec-unary-algebraic-pattern-matches","titleHTML":"Runtime Semantics: UnaryAlgebraicPatternMatches","number":"30.1.13","referencingIds":["_ref_115"]},{"type":"op","aoid":"RelationalPatternMatches","refId":"sec-relational-pattern-matches"},{"type":"clause","id":"sec-relational-pattern-matches","titleHTML":"Runtime Semantics: RelationalPatternMatches","number":"30.1.14","referencingIds":["_ref_116"]},{"type":"op","aoid":"IfPatternMatches","refId":"sec-if-pattern-matches"},{"type":"clause","id":"sec-if-pattern-matches","titleHTML":"Runtime Semantics: IfPatternMatches","number":"30.1.15","referencingIds":["_ref_117"]},{"type":"op","aoid":"CombinedMatchPatternMatches","refId":"sec-combined-match-pattern-matches"},{"type":"clause","id":"sec-combined-match-pattern-matches","titleHTML":"Runtime Semantics: CombinedMatchPatternMatches","number":"30.1.16","referencingIds":["_ref_118"]},{"type":"clause","id":"sec-match-patterns","titleHTML":"Match Patterns","number":"30.1"},{"type":"production","id":"prod-MatchStatement","name":"MatchStatement","referencingIds":["_ref_247","_ref_253","_ref_262"]},{"type":"production","id":"prod-MatchStatementClauses","name":"MatchStatementClauses","referencingIds":["_ref_251","_ref_278","_ref_279","_ref_282","_ref_284","_ref_286","_ref_287","_ref_561","_ref_563","_ref_565","_ref_567","_ref_569","_ref_571","_ref_573","_ref_576","_ref_578","_ref_580","_ref_581"]},{"type":"production","id":"prod-MatchStatementClause","name":"MatchStatementClause","referencingIds":["_ref_280","_ref_281","_ref_283","_ref_285","_ref_562","_ref_564","_ref_574","_ref_575","_ref_577","_ref_579"]},{"type":"clause","id":"sec-match-statement-static-semantics-early-errors","titleHTML":"Static Semantics: Early Errors","number":"30.2.1"},{"type":"clause","id":"sec-match-statement-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: Evaluation","number":"30.2.2"},{"type":"op","aoid":"MatchStatementClausesEvaluation","refId":"sec-match-statement-clauses-runtime-semantics-evaluation"},{"type":"clause","id":"sec-match-statement-clauses-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: MatchStatementClausesEvaluation","number":"30.2.3","referencingIds":["_ref_185","_ref_190","_ref_192"]},{"type":"op","aoid":"MatchStatementClauseEvaluation","refId":"sec-match-statement-clause-runtime-semantics-evaluation"},{"type":"clause","id":"sec-match-statement-clause-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: MatchStatementClauseEvaluation","number":"30.2.4","referencingIds":["_ref_189","_ref_191"]},{"type":"clause","id":"sec-match-statement","title":"The match Statement","titleHTML":"The <code>match</code> Statement","number":"30.2","referencingIds":["_ref_5","_ref_19"]},{"type":"production","id":"prod-MatchExpression","name":"MatchExpression","referencingIds":["_ref_246","_ref_252","_ref_254","_ref_255","_ref_265","_ref_266"]},{"type":"production","id":"prod-MatchExpressionClauses","name":"MatchExpressionClauses","referencingIds":["_ref_250","_ref_267","_ref_268","_ref_271","_ref_273","_ref_275","_ref_276","_ref_584","_ref_586","_ref_588","_ref_590","_ref_591","_ref_593","_ref_595","_ref_598","_ref_600","_ref_602","_ref_603"]},{"type":"production","id":"prod-MatchExpressionClause","name":"MatchExpressionClause","referencingIds":["_ref_269","_ref_270","_ref_272","_ref_274","_ref_585","_ref_587","_ref_596","_ref_597","_ref_599","_ref_601"]},{"type":"production","id":"prod-MatchHead","name":"MatchHead","referencingIds":["_ref_568","_ref_572","_ref_592","_ref_594"]},{"type":"clause","id":"sec-match-expression-static-semantics-early-errors","titleHTML":"Static Semantics: Early Errors","number":"30.3.1"},{"type":"clause","id":"sec-match-expression-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: Evaluation","number":"30.3.2"},{"type":"op","aoid":"MatchExpressionClausesEvaluation","refId":"sec-match-expression-clauses-runtime-semantics-evaluation"},{"type":"clause","id":"sec-match-expression-clauses-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: MatchExpressionClausesEvaluation","number":"30.3.3","referencingIds":["_ref_197","_ref_202","_ref_205"]},{"type":"op","aoid":"MatchExpressionClauseEvaluation","refId":"sec-match-expression-clause-runtime-semantics-evaluation"},{"type":"clause","id":"sec-match-expression-clause-runtime-semantics-evaluation","titleHTML":"Runtime Semantics: MatchExpressionClauseEvaluation","number":"30.3.4","referencingIds":["_ref_201","_ref_204"]},{"type":"clause","id":"sec-match-expression","title":"The match Expression","titleHTML":"The <code>match</code> Expression","number":"30.3","referencingIds":["_ref_4","_ref_17","_ref_18"]},{"type":"op","aoid":"InvokeCustomMatcher","refId":"sec-invoke-custom-matcher"},{"type":"clause","id":"sec-invoke-custom-matcher","title":"InvokeCustomMatcher ( matcher, subject, cacheGroup, kind, receiver )","titleHTML":"InvokeCustomMatcher ( <var>matcher</var>, <var>subject</var>, <var>cacheGroup</var>, <var>kind</var>, <var>receiver</var> )","number":"30.4.1","referencingIds":["_ref_1","_ref_128","_ref_129"]},{"type":"op","aoid":"ValidateCustomMatcherHint","refId":"sec-validatecustommatcherhint"},{"type":"clause","id":"sec-validatecustommatcherhint","title":"ValidateCustomMatcherHint ( hint [ , kind ] )","titleHTML":"ValidateCustomMatcherHint ( <var>hint</var> [ , <var>kind</var> ] )","number":"30.4.2","referencingIds":["_ref_53","_ref_54","_ref_55","_ref_56","_ref_58","_ref_61","_ref_63","_ref_65","_ref_67","_ref_68","_ref_69","_ref_70","_ref_81","_ref_83","_ref_86","_ref_87","_ref_88","_ref_89","_ref_90","_ref_91","_ref_92","_ref_93","_ref_94","_ref_95","_ref_96","_ref_97"]},{"type":"op","aoid":"CreateMatchCache","refId":"sec-creatematchcache"},{"type":"clause","id":"sec-creatematchcache","titleHTML":"CreateMatchCache ( )","number":"30.4.3","referencingIds":["_ref_33","_ref_184","_ref_196","_ref_218","_ref_220","_ref_224","_ref_227","_ref_233","_ref_236","_ref_244"]},{"type":"op","aoid":"GetMatchCache","refId":"sec-get-match-cache"},{"type":"clause","id":"sec-get-match-cache","title":"GetMatchCache ( subject, cacheGroup )","titleHTML":"GetMatchCache ( <var>subject</var>, <var>cacheGroup</var> )","number":"30.4.4","referencingIds":["_ref_221","_ref_225","_ref_228","_ref_234","_ref_237","_ref_242"]},{"type":"op","aoid":"HasPropertyCached","refId":"sec-has-property-cached"},{"type":"clause","id":"sec-has-property-cached","title":"HasPropertyCached ( subject, cacheGroup, propertyName )","titleHTML":"HasPropertyCached ( <var>subject</var>, <var>cacheGroup</var>, <var>propertyName</var> )","number":"30.4.5","referencingIds":["_ref_141","_ref_142","_ref_145","_ref_147"]},{"type":"op","aoid":"GetCached","refId":"sec-get-cached"},{"type":"clause","id":"sec-get-cached","title":"GetCached ( subject, cacheGroup, propertyName )","titleHTML":"GetCached ( <var>subject</var>, <var>cacheGroup</var>, <var>propertyName</var> )","number":"30.4.6","referencingIds":["_ref_143","_ref_146","_ref_148","_ref_151","_ref_229"]},{"type":"op","aoid":"GetIteratorCached","refId":"sec-get-iterator-cached"},{"type":"clause","id":"sec-get-iterator-cached","title":"GetIteratorCached ( subject, cacheGroup )","titleHTML":"GetIteratorCached ( <var>subject</var>, <var>cacheGroup</var> )","number":"30.4.7","referencingIds":["_ref_153","_ref_214","_ref_241"]},{"type":"op","aoid":"IteratorStepCached","refId":"sec-iterator-step-cached"},{"type":"clause","id":"sec-iterator-step-cached","title":"IteratorStepCached ( iterator, cacheGroup )","titleHTML":"IteratorStepCached ( <var>iterator</var>, <var>cacheGroup</var> )","number":"30.4.8","referencingIds":["_ref_238","_ref_239"]},{"type":"op","aoid":"GetIteratorNthValueCached","refId":"sec-get-iterator-nth-value-cached"},{"type":"clause","id":"sec-get-iterator-nth-value-cached","title":"GetIteratorNthValueCached ( iterator, cacheGroup, n )","titleHTML":"GetIteratorNthValueCached ( <var>iterator</var>, <var>cacheGroup</var>, <var>n</var> )","number":"30.4.9","referencingIds":["_ref_156","_ref_163","_ref_170","_ref_172","_ref_174","_ref_243"]},{"type":"op","aoid":"FinishListMatch","refId":"sec-finish-list-match"},{"type":"clause","id":"sec-finish-list-match","title":"FinishListMatch ( subject, cacheGroup, expectedLength )","titleHTML":"FinishListMatch ( <var>subject</var>, <var>cacheGroup</var>, <var>expectedLength</var> )","number":"30.4.10","referencingIds":["_ref_130","_ref_154","_ref_158","_ref_159","_ref_161","_ref_165","_ref_166"]},{"type":"op","aoid":"FinishMatch","refId":"sec-finish-match"},{"type":"clause","id":"sec-finish-match","title":"FinishMatch ( matchCompletion, cacheGroup )","titleHTML":"FinishMatch ( <var>matchCompletion</var>, <var>cacheGroup</var> )","number":"30.4.11","referencingIds":["_ref_35","_ref_186","_ref_198"]},{"type":"note","id":"sec-pattern-match-cache-note","number":1,"referencingIds":["_ref_2"]},{"type":"clause","id":"sec-abstract-operations-for-pattern-matching","titleHTML":"Abstract Operations for Pattern Matching","number":"30.4"},{"type":"clause","id":"sec-pattern-matching","title":"Pattern Matching","titleHTML":"<ins>Pattern Matching</ins>","number":"30","referencingIds":["_ref_0","_ref_16"]},{"type":"clause","id":"sec-expressions","titleHTML":"Expressions","number":"A.1"},{"type":"clause","id":"sec-statements","titleHTML":"Statements","number":"A.2"},{"type":"clause","id":"sec-annex-match-patterns","titleHTML":"Patterns","number":"A.9"},{"type":"clause","id":"sec-grammar-summary","titleHTML":"Grammar Summary","number":"A"},{"type":"clause","id":"sec-parsepattern-annexb","title":"Static Semantics: ParsePattern ( patternText, u, v, canCreateBinding )","titleHTML":"Static Semantics: ParsePattern ( <var>patternText</var>, <var>u</var>, <var>v</var><ins>, <var>canCreateBinding</var></ins> )","number":"B.1.2.9"},{"type":"clause","id":"sec-regular-expressions-patterns","titleHTML":"Regular Expressions Patterns","number":"B.1.2"},{"type":"clause","id":"sec-additional-syntax","titleHTML":"Additional Syntax","number":"B.1"},{"type":"clause","id":"sec-regexp.prototype.compile","title":"RegExp.prototype.compile ( pattern, flags )","titleHTML":"RegExp.prototype.compile ( <var>pattern</var>, <var>flags</var> )","number":"B.2.4.1"},{"type":"clause","id":"sec-additional-properties-of-the-regexp.prototype-object","titleHTML":"Additional Properties of the RegExp.prototype Object","number":"B.2.4"},{"type":"clause","id":"sec-additional-built-in-properties","titleHTML":"Additional Built-in Properties","number":"B.2"},{"type":"clause","id":"sec-additional-ecmascript-features-for-web-browsers","titleHTML":"Additional ECMAScript Features for Web Browsers","number":"B"},{"type":"clause","id":"sec-copyright-and-software-license","title":"Copyright & Software License","titleHTML":"Copyright &amp; Software License","number":"C"}]}`);
;let usesMultipage = false