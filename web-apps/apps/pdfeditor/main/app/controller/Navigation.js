/*
 * Copyright (C) Ascensio System SIA, 2009-2026
 *
 * This program is a free software product. You can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License (AGPL)
 * version 3 as published by the Free Software Foundation, together with the
 * additional terms provided in the LICENSE file.
 *
 * This program is distributed WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. For
 * details, see the GNU AGPL at: https://www.gnu.org/licenses/agpl-3.0.html
 *
 * You can contact Ascensio System SIA by email at info@onlyoffice.com
 * or by postal mail at 20A-6 Ernesta Birznieka-Upisha Street, Riga,
 * LV-1050, Latvia, European Union.
 *
 * The interactive user interfaces in modified versions of the Program
 * are required to display Appropriate Legal Notices in accordance with
 * Section 5 of the GNU AGPL version 3.
 *
 * No trademark rights are granted under this License.
 *
 * All non-code elements of the Product, including illustrations,
 * icon sets, and technical writing content, are licensed under the
 * Creative Commons Attribution-ShareAlike 4.0 International License:
 * https://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 * This license applies only to such non-code elements and does not
 * modify or replace the licensing terms applicable to the Program's
 * source code, which remains licensed under the GNU Affero General
 * Public License v3.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
/**
 * Date: 14.12.17
 */

define([
    'core',
    'pdfeditor/main/app/collection/Navigation',
    'pdfeditor/main/app/view/Navigation'
], function () {
    'use strict';

    PDFE.Controllers.Navigation = Backbone.Controller.extend(_.extend({
        models: [],
        collections: [
            'Navigation'
        ],
        views: [
            'Navigation'
        ],

        initialize: function() {
            var me = this;
            this.addListeners({
                'Navigation': {
                    'show': function() {
                        if (me.panelNavigation && me.panelNavigation.viewNavigationList) {
                            me.panelNavigation.viewNavigationList.scroller && me.panelNavigation.viewNavigationList.scroller.update({alwaysVisibleY: true});
                            me.panelNavigation.viewNavigationList.focus();
                        }
                    }
                }
            });
        },

        events: function() {
        },

        onLaunch: function() {
            this.panelNavigation= this.createView('Navigation', {
                storeNavigation: this.getApplication().getCollection('Navigation')
            });
            this.panelNavigation.on('render:after', _.bind(this.onAfterRender, this));
            this._viewerNavigationObject = null;
            this._isDisabled = false;
        },

        setApi: function(api) {
            this.api = api;
            this.api.asc_registerCallback('asc_onViewerBookmarksUpdate', _.bind(this.updateViewerNavigation, this));
            return this;
        },

        setMode: function(mode) {
            this.mode = mode;
            this.canUseViwerNavigation = this.mode.canUseViwerNavigation;
            return this;
        },

        onAfterRender: function(panelNavigation) {
            panelNavigation.viewNavigationList.on('item:click', _.bind(this.onSelectItem, this));
            panelNavigation.viewNavigationList.on('item:contextmenu', _.bind(this.onItemContextMenu, this));
            // item:contextmenu only fires on bookmark rows, so an EMPTY tree had no way
            // to open the menu at all — the first bookmark could never be added. Catch
            // right-clicks on empty space of the panel here.
            panelNavigation.$el.on('contextmenu', _.bind(this.onEmptyTreeContextMenu, this));
            panelNavigation.viewNavigationList.on('item:add', _.bind(this.onItemAdd, this));
            panelNavigation.navigationMenu.on('item:click',           _.bind(this.onMenuItemClick, this));
            // Expand-to-level submenu is now at index 6 (after the 3 bookmark items + separator).
            panelNavigation.navigationMenu.items[6].menu.on('item:click', _.bind(this.onMenuLevelsItemClick, this));
            panelNavigation.btnSettingsMenu.on('item:click',           _.bind(this.onMenuSettingsItemClick, this));
            panelNavigation.btnSettingsMenu.items[2].menu.on('item:click', _.bind(this.onMenuLevelsItemClick, this));
            panelNavigation.btnSettingsMenu.items[4].menu.on('item:click', _.bind(this.onMenuFontSizeClick, this));
            panelNavigation.btnClose.on('click', _.bind(this.onClickClosePanel, this));

            this._bindBookmarkDrag(panelNavigation);

            var viewport = this.getApplication().getController('Viewport').getView('Viewport');
            viewport.hlayout.on('layout:resizedrag',  function () {
                if (panelNavigation.viewNavigationList && panelNavigation.viewNavigationList.scroller)
                    panelNavigation.viewNavigationList.scroller.update({alwaysVisibleY: true});
            });
        },

        // ================= Bookmark drag & drop =================
        // Drag a bookmark (together with its whole subtree) inside the navigation
        // tree. Drop between rows reorders and re-levels it (the horizontal indent
        // of the drop line decides the target level); dropping onto the middle of a
        // row makes the bookmark the first child of that row. The result goes
        // through the regular asc_SetStructure pipeline, so it persists like any
        // other bookmark edit.
        _bindBookmarkDrag: function (panelNavigation) {
            var me = this;
            var list = panelNavigation.viewNavigationList;
            if (!list || !list.$el) return;

            list.$el.off('.bookmarkDrag');
            $(document).off('.bookmarkDrag');

            list.$el.on('mousedown.bookmarkDrag', function (e) {
                if (1 !== e.which) return;                             // left button only
                if ($(e.target).closest('.tree-caret').length) return; // expand/collapse caret

                var record = me._getRecordByElement(e.target);
                if (!record || record.get('isNotHeader')) return;
                if (me._viewerNavigationObject === null) return;

                me._dragInfo = {
                    record: record,
                    startX: e.clientX,
                    startY: e.clientY,
                    active: false,
                    drop: null
                };
            });

            $(document).on('mousemove.bookmarkDrag', _.bind(me._onDragMouseMove, me));
            $(document).on('mouseup.bookmarkDrag',   _.bind(me._onDragMouseUp, me));
        },

        _getRecordByElement: function (el) {
            var list = this.panelNavigation && this.panelNavigation.viewNavigationList;
            if (!list || !list.dataViewItems) return null;
            for (var i = 0; i < list.dataViewItems.length; i++) {
                var item = list.dataViewItems[i];
                if (item && item.el && (item.el === el || $.contains(item.el, el))) {
                    return item.model;
                }
            }
            return null;
        },

        // Visible rows in top-to-bottom order with their structure indexes/levels
        // (levels are record levels — 0-based; structure data levels are +1).
        _getVisibleRows: function () {
            var list = this.panelNavigation && this.panelNavigation.viewNavigationList;
            var rows = [];
            if (!list || !list.dataViewItems) return rows;
            for (var i = 0; i < list.dataViewItems.length; i++) {
                var item = list.dataViewItems[i];
                var rec = item && item.model;
                if (!rec || !rec.get('isVisible')) continue;
                rows.push({
                    record:    rec,
                    el:        item.el,
                    index:     rec.get('index') | 0,
                    level:     rec.get('level') | 0,
                    notHeader: !!rec.get('isNotHeader')
                });
            }
            return rows;
        },

        _onDragMouseMove: function (e) {
            var info = this._dragInfo;
            if (!info) return;

            if (!info.active) {
                if (Math.abs(e.clientY - info.startY) < 5 && Math.abs(e.clientX - info.startX) < 5)
                    return;
                info.active = true;
                var rows0 = this._getVisibleRows();
                for (var i = 0; i < rows0.length; i++) {
                    if (rows0[i].record === info.record) {
                        info.dragRow = i;
                        rows0[i].el.style.opacity = '0.45';
                        info.draggedEl = rows0[i].el;
                        break;
                    }
                }
                // end of the dragged subtree in visible-row space
                info.subEndRow = info.dragRow;
                if (info.dragRow !== undefined) {
                    var lvl = rows0[info.dragRow].level;
                    while (info.subEndRow + 1 < rows0.length && rows0[info.subEndRow + 1].level > lvl)
                        info.subEndRow++;
                }
            }

            e.preventDefault();   // no text selection while dragging
            info.drop = this._computeDropTarget(e);
            this._paintDropIndicator(info.drop);
        },

        _onDragMouseUp: function () {
            var info = this._dragInfo;
            this._dragInfo = null;
            this._removeDropIndicator();
            if (!info) return;

            if (info.draggedEl) info.draggedEl.style.opacity = '';
            if (!info.active) return;

            // swallow the click-navigate that follows the mouseup
            this._suppressClickUntil = Date.now() + 400;
            if (info.drop) this._applyBookmarkDrop(info);
        },

        // Resolve the current pointer position into a drop target:
        //   { gap: visibleRowIdx, level }  — insert BEFORE that visible row
        //   { into: visibleRowIdx, level } — become first child of that row
        // plus dataInsertBefore (structure-array index to insert before).
        _computeDropTarget: function (e) {
            var info = this._dragInfo;
            if (!info || info.dragRow === undefined) return null;

            var rows = this._getVisibleRows();
            if (!rows.length) return null;

            var y = e.clientY, x = e.clientX;
            var target = null;
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i].el.getBoundingClientRect();
                if (y >= r.top && y <= r.bottom) {
                    var rel = (r.bottom - r.top) > 0 ? (y - r.top) / (r.bottom - r.top) : 0.5;
                    if (rel < 0.28)      target = { gap: i };
                    else if (rel > 0.72) target = { gap: i + 1 };
                    else                 target = { into: i };
                    break;
                }
            }
            if (!target) {
                var firstRect = rows[0].el.getBoundingClientRect();
                target = (y < firstRect.top) ? { gap: 0 } : { gap: rows.length };
            }

            // the drop must stay outside of the dragged subtree
            if (target.gap !== undefined) {
                if (target.gap > info.dragRow && target.gap <= info.subEndRow)
                    return null;
            } else if (target.into !== undefined) {
                if (target.into >= info.dragRow && target.into <= info.subEndRow)
                    return null;
                if (rows[target.into].notHeader)
                    return null;
            }

            if (target.gap !== undefined) {
                var g = target.gap;
                var nextRow = (g < rows.length) ? rows[g] : null;
                var prevRow = (g > 0) ? rows[g - 1] : null;
                var lower = nextRow ? nextRow.level : 0;
                var upper = prevRow ? (prevRow.level + 1) : 0;
                if (lower > upper) lower = upper;
                // horizontal position picks the level inside the allowed range
                // (row indent = level*16 + 24 px, see the tree item template)
                var cont = this._getListInnerEl();
                var contLeft = cont ? cont.getBoundingClientRect().left : 0;
                var byX = Math.round((x - contLeft - 24) / 16);
                target.level = Math.min(Math.max(byX, lower), upper);
                target.dataInsertBefore = nextRow ? nextRow.index : this._viewerNavigationObject.length;
            } else {
                target.level = rows[target.into].level + 1;
                target.dataInsertBefore = rows[target.into].index + 1;
            }
            return target;
        },

        _applyBookmarkDrop: function (info) {
            var me = this;
            var drop = info.drop;
            var arr = (this._viewerNavigationObject || []).slice();
            var srcIdx = info.record.get('index') | 0;
            if (srcIdx < 0 || srcIdx >= arr.length) return;

            var srcDataLevel = arr[srcIdx].level | 0;
            var count = 1;
            while (srcIdx + count < arr.length && (arr[srcIdx + count].level | 0) > srcDataLevel)
                count++;

            var insertAt = drop.dataInsertBefore;
            var newDataLevel = drop.level + 1;             // record level -> data level
            var delta = newDataLevel - srcDataLevel;
            if (insertAt > srcIdx) insertAt -= count;
            if (insertAt < 0) insertAt = 0;

            var before = arr.map(function (it) { return (it.level | 0) + ':' + it.description; }).join('|');

            var sub = arr.splice(srcIdx, count);
            for (var i = 0; i < sub.length; i++) {
                sub[i] = {
                    page: sub[i].page,
                    level: (sub[i].level | 0) + delta,
                    y: sub[i].y,
                    description: sub[i].description
                };
            }
            Array.prototype.splice.apply(arr, [insertAt, 0].concat(sub));

            var after = arr.map(function (it) { return (it.level | 0) + ':' + it.description; }).join('|');
            if (before === after) return;                  // nothing moved — keep history clean

            if (me.api && typeof me.api.asc_SetStructure === 'function') {
                me.api.asc_SetStructure(arr);
            }
        },

        _getListInnerEl: function () {
            var list = this.panelNavigation && this.panelNavigation.viewNavigationList;
            if (!list || !list.dataViewItems || !list.dataViewItems.length) return null;
            return list.dataViewItems[0].el.parentNode;
        },

        _paintDropIndicator: function (drop) {
            var inner = this._getListInnerEl();
            if (!inner) { this._removeDropIndicator(); return; }

            if (!this._dropIndicator || this._dropIndicator.parentNode !== inner) {
                this._removeDropIndicator();
                this._dropIndicator = $('<div class="bookmark-drop-indicator"></div>').css({
                    position: 'absolute',
                    height: '2px',
                    background: '#3d82f0',
                    zIndex: 5,
                    pointerEvents: 'none',
                    display: 'none'
                })[0];
                this._dropIndicator.appendChild($('<div></div>').css({
                    position: 'absolute', left: '-3px', top: '-3px',
                    width: '8px', height: '8px', borderRadius: '4px', background: '#3d82f0'
                })[0]);
                if ($(inner).css('position') === 'static')
                    inner.style.position = 'relative';
                inner.appendChild(this._dropIndicator);
            }

            if (!drop) { this._dropIndicator.style.display = 'none'; return; }

            var rows = this._getVisibleRows();
            var innerRect = inner.getBoundingClientRect();
            var top = 0;
            var refEl = null;

            if (drop.gap !== undefined) {
                if (drop.gap < rows.length)           refEl = rows[drop.gap].el;
                else if (rows.length)                 refEl = rows[rows.length - 1].el;
                if (refEl) {
                    var rr = refEl.getBoundingClientRect();
                    top = (drop.gap < rows.length)
                        ? rr.top - innerRect.top + inner.scrollTop
                        : rr.bottom - innerRect.top + inner.scrollTop;
                }
            } else if (drop.into !== undefined && rows[drop.into]) {
                var tr = rows[drop.into].el.getBoundingClientRect();
                top = tr.bottom - innerRect.top + inner.scrollTop;   // just below the parent row
            }

            var indent = 24 + drop.level * 16;
            var ind = this._dropIndicator;
            ind.style.display = 'block';
            ind.style.top = top + 'px';
            ind.style.left = indent + 'px';
            ind.style.right = '4px';
        },

        _removeDropIndicator: function () {
            if (this._dropIndicator && this._dropIndicator.parentNode) {
                this._dropIndicator.parentNode.removeChild(this._dropIndicator);
            }
            this._dropIndicator = null;
        },

        onItemContextMenu: function(picker, item, record, e){
            var showPoint;
            var menu = this.panelNavigation.navigationMenu;
            if (menu.isVisible()) {
                menu.hide();
            }

            var parentOffset = Common.Utils.getOffset(this.panelNavigation.$el),
                top = e.clientY*Common.Utils.zoom();
            showPoint = [e.clientX*Common.Utils.zoom() + 5, top - parentOffset.top + 5];

            if (showPoint != undefined) {
                var menuContainer = this.panelNavigation.$el.find('#menu-navigation-container');
                if (!menu.rendered) {
                    if (menuContainer.length < 1) {
                        menuContainer = $('<div id="menu-navigation-container" style="position: absolute; z-index: 10000;"><div class="dropdown-toggle" data-toggle="dropdown"></div></div>', menu.id);
                        $(this.panelNavigation.$el).append(menuContainer);
                    }
                    menu.render(menuContainer);
                    menu.cmpEl.attr({tabindex: "-1"});
                }
                menu.cmpEl.attr('data-value', record.get('index'));
                this._setBookmarkMenuTargets(true);
                menuContainer.css({
                    left: showPoint[0],
                    top: showPoint[1]
                });
                menu.show();
                _.delay(function() {
                    menu.cmpEl.focus();
                }, 10);
            }

        },

        // Right-click on empty space of the navigation panel (no bookmarks yet, or
        // below the last row). Opens the same menu with no target bookmark: only
        // "Add Bookmark" is usable — Rename/Delete have nothing to act on.
        onEmptyTreeContextMenu: function(e){
            var list = this.panelNavigation && this.panelNavigation.viewNavigationList;
            if (!list) return;
            // On a bookmark row the item:contextmenu handler owns the event; on panel
            // controls (buttons, menu toggles) leave the default behaviour alone.
            if (this._getRecordByElement(e.target)) return;
            if ($(e.target).closest('button, .btn, a, input, .dropdown-toggle').length) return;
            if (e.preventDefault) e.preventDefault();

            var menu = this.panelNavigation.navigationMenu;
            if (menu.isVisible()) {
                menu.hide();
            }

            var parentOffset = Common.Utils.getOffset(this.panelNavigation.$el),
                top = e.clientY*Common.Utils.zoom();
            var showPoint = [e.clientX*Common.Utils.zoom() + 5, top - parentOffset.top + 5];

            var menuContainer = this.panelNavigation.$el.find('#menu-navigation-container');
            if (!menu.rendered) {
                if (menuContainer.length < 1) {
                    menuContainer = $('<div id="menu-navigation-container" style="position: absolute; z-index: 10000;"><div class="dropdown-toggle" data-toggle="dropdown"></div></div>', menu.id);
                    $(this.panelNavigation.$el).append(menuContainer);
                }
                menu.render(menuContainer);
                menu.cmpEl.attr({tabindex: "-1"});
            }
            menu.cmpEl.attr('data-value', '');
            this._setBookmarkMenuTargets(false);
            menuContainer.css({
                left: showPoint[0],
                top: showPoint[1]
            });
            menu.show();
            _.delay(function() {
                menu.cmpEl.focus();
            }, 10);
        },

        // Rename/Delete need a target bookmark; grey them out when the menu was opened
        // on empty space.
        _setBookmarkMenuTargets: function(enabled) {
            var menu = this.panelNavigation && this.panelNavigation.navigationMenu;
            if (!menu || !menu.items) return;
            for (var i = 1; i <= 2; i++) {   // 1 = rename-bookmark, 2 = delete-bookmark
                var item = menu.items[i];
                if (item && typeof item.setDisabled === 'function') {
                    item.setDisabled(!enabled);
                }
            }
        },

        onSelectItem: function(picker, item, record, e){
            // A click right after a bookmark drag is the tail of the drag gesture —
            // don't navigate in that case.
            if (this._suppressClickUntil && Date.now() < this._suppressClickUntil) return;
            this._viewerNavigationObject && this.api.asc_viewerNavigateTo(record.get('index'));
        },

        onItemAdd: function(picker, item, record, e){
            record.set('dataItem', item);
        },

        onMenuItemClick: function (menu, item) {
            if (!item) return;
            if (item.value == 'expand') {
                this.panelNavigation.viewNavigationList.expandAll();
            } else  if (item.value == 'collapse') {
                this.panelNavigation.viewNavigationList.collapseAll();
            } else if (item.value == 'add-bookmark') {
                this.onAddBookmark();
            } else if (item.value == 'rename-bookmark') {
                this.onRenameBookmark();
            } else if (item.value == 'delete-bookmark') {
                this.onDeleteBookmark();
            }
        },

        onAddBookmark: function() {
            var me = this;

            // Target = the right-clicked bookmark (menu data-value) or the selected
            // record. The new bookmark nests under it (level + 1) and is inserted right
            // after its subtree — appending at the end instead could visually attach it
            // to a different parent when the target is not the last item of its level.
            // With no target, append at root level.
            var selIdx = me._getActiveBookmarkIndex();

            // The bookmark must point at the current view: the current page plus the
            // top-down offset within that page, expressed in PDF points — the same
            // space CHtmlPage.navigate() consumes when the bookmark is clicked later:
            //     posY = drawingPage.Y - betweenPages + item.y * (drawingPage.H / pdfPage.H)
            // Storing the raw document scroll here (an absolute scroll offset, in
            // viewer pixels) lands the target on the wrong spot of the page and is
            // clamped by the writer for any page but the first.
            var currentPage = 0, bookmarkY = 0;
            try {
                if (me.api && typeof me.api.getCurrentPage === 'function') {
                    currentPage = me.api.getCurrentPage() | 0;
                }
                var renderer = (me.api && me.api.getDocumentRenderer) ? me.api.getDocumentRenderer() : null;
                var scroll = (me.api && typeof me.api.getCurScroll === 'function') ? me.api.getCurScroll() : null;
                if (renderer && scroll && renderer.drawingPages && renderer.file &&
                        renderer.file.pages && renderer.file.pages[currentPage]) {
                    var drawingPage = renderer.drawingPages[currentPage];
                    var pdfPage = renderer.file.pages[currentPage];
                    if (drawingPage && pdfPage && pdfPage.H > 0) {
                        var pageTop = drawingPage.Y - (renderer.betweenPages || 0);
                        var scale = drawingPage.H / pdfPage.H;    // viewer px per PDF point
                        if (scale > 0) {
                            var yPts = (scroll.y - pageTop) / scale;
                            bookmarkY = Math.max(0, Math.min(pdfPage.H, Math.round(yPts)));
                        }
                    }
                }
            } catch (e) { /* ignore */ }

            me._showBookmarkPrompt(this.txtAddBookmark, this.txtNewBookmark, '', function(newName) {
                if (newName === null) return; // user cancelled
                var arr = (me._viewerNavigationObject || []).slice();
                var insertAt = arr.length;
                var newLevel = 1;
                if (selIdx >= 0 && arr[selIdx]) {
                    var selLevel = arr[selIdx].level | 0;
                    newLevel = selLevel + 1;
                    insertAt = selIdx + 1;
                    while (insertAt < arr.length && (arr[insertAt].level | 0) > selLevel) {
                        insertAt++;
                    }
                }
                arr.splice(insertAt, 0, {
                    page: currentPage,
                    level: newLevel,
                    y: bookmarkY,
                    description: newName
                });
                if (me.api && typeof me.api.asc_SetStructure === 'function') {
                    me.api.asc_SetStructure(arr);
                }
            });
        },

        onRenameBookmark: function() {
            var me = this;
            // Selection may not have fired when the menu item is clicked (e.g. keyboard
            // activation). Fall back to the menu's data-value attribute which is set
            // by onItemContextMenu when the user right-clicks.
            var idx = me._getActiveBookmarkIndex();
            if (idx < 0) return;

            var currentName = (this._viewerNavigationObject && this._viewerNavigationObject[idx])
                ? this._viewerNavigationObject[idx].description
                : '';

            me._showBookmarkPrompt(this.txtRenameBookmark, this.txtNewBookmark, currentName, function(newName) {
                if (newName === null) return;
                var arr = (me._viewerNavigationObject || []).slice();
                if (arr[idx]) {
                    arr[idx] = {
                        page: arr[idx].page | 0,
                        level: arr[idx].level | 0,
                        y: (+arr[idx].y) || 0,
                        description: newName
                    };
                    if (me.api && typeof me.api.asc_SetStructure === 'function') {
                        me.api.asc_SetStructure(arr);
                    }
                }
            });
        },

        onDeleteBookmark: function() {
            var me = this;
            var idx = me._getActiveBookmarkIndex();
            if (idx < 0) return;
            var arr = (this._viewerNavigationObject || []).slice();
            // Delete the bookmark together with its whole subtree: in the flat level
            // sequence the descendants are the immediately following items whose level
            // is deeper than the target's. Removing just the item would leave the
            // children behind, re-parented to whatever precedes them in the tree.
            var baseLevel = arr[idx].level | 0;
            var removeCount = 1;
            while (idx + removeCount < arr.length && (arr[idx + removeCount].level | 0) > baseLevel) {
                removeCount++;
            }
            arr.splice(idx, removeCount);
            if (me.api && typeof me.api.asc_SetStructure === 'function') {
                me.api.asc_SetStructure(arr);
            }
        },

        // Resolve which bookmark the user is acting on. The right-clicked record
        // (stored on the menu as data-value by onItemContextMenu) wins: right-click
        // does not move the tree selection, so a stale selected record may point at
        // a different bookmark than the one the menu was opened on. Fall back to the
        // selected record for paths invoked without a context menu. -1 if none.
        _getActiveBookmarkIndex: function() {
            var menu = this.panelNavigation && this.panelNavigation.navigationMenu;
            if (menu && menu.cmpEl) {
                var dv = menu.cmpEl.attr('data-value');
                if (dv !== undefined && dv !== null && dv !== '') {
                    var n = parseInt(dv, 10);
                    if (!isNaN(n) && n >= 0) return n;
                }
            }
            var view = this.panelNavigation && this.panelNavigation.viewNavigationList;
            var selected = view && view.getSelectedRec ? view.getSelectedRec() : null;
            if (selected) {
                // NOTE: use the record's own 'index' field. record.get('dataItem') is the
                // item's *view* object (set by onItemAdd), which has no index — reading
                // .index off it yields undefined → 0 → "always acts on the first bookmark".
                var nRecIdx = selected.get('index');
                if (nRecIdx !== undefined && nRecIdx !== null && nRecIdx >= 0) return nRecIdx | 0;
            }
            return -1;
        },

        // Lightweight single-input modal prompt. Calls onResult(name) on OK, onResult(null) on cancel.
        _showBookmarkPrompt: function(caption, placeholder, defaultValue, onResult) {
            var me = this;
            var dialogId = 'pdf-bookmark-prompt';
            var inputId = dialogId + '-input';

            var PromptDialog = Common.UI.Window.extend(_.extend({
                options: {
                    id: dialogId,
                    width: 320,
                    cls: 'modal-dlg',
                    header: true,
                    buttons: ['ok', 'cancel']
                },

                initialize: function(options) {
                    _.extend(this.options, options || {});
                    this.template = [
                        '<div class="box">',
                            '<div class="input-row">',
                                '<label>' + me.txtBookmarkName + '</label>',
                            '</div>',
                            '<div id="' + inputId + '" class="input-row"></div>',
                        '</div>'
                    ].join('');
                    this.options.tpl = _.template(this.template)(this.options);
                    Common.UI.Window.prototype.initialize.call(this, this.options);
                },

                render: function() {
                    Common.UI.Window.prototype.render.call(this);
                    var self = this;
                    self.inputName = new Common.UI.InputField({
                        el: $('#' + inputId),
                        style: 'width: 100%;',
                        allowBlank: true,
                        validateOnBlur: false,
                        maxLength: 80,
                        placeholder: placeholder
                    });
                    if (defaultValue) {
                        self.inputName.setValue(defaultValue);
                    }
                    var $window = self.getChild();
                    $window.find('.footer .dlg-btn').on('click', _.bind(self.onBtnClick, self));
                    var $inputEl = $window.find('input');
                    $inputEl.on('keydown', function(e) {
                        if (e.keyCode === Common.UI.Keys.ENTER) {
                            // Pressing Enter in the input: InputField's onKeyDown already
                            // calls _doChange, so self.inputName.getValue() is fresh.
                            self._handleInput('ok');
                        }
                    });
                    _.defer(function() {
                        $inputEl.focus();
                        if (defaultValue) $inputEl.select();
                    });
                },

                onBtnClick: function(event) {
                    // Clicking a footer button takes focus off the input — InputField's
                    // 'blur' handler (bound on render:line 165) runs first and refreshes
                    // this.value from the DOM. So getValue() returns the latest.
                    this._handleInput(event.currentTarget.attributes['result'].value);
                },

                onPrimary: function(event) {
                    this._handleInput('ok');
                    return false;
                },

                _handleInput: function(state) {
                    if (state === 'ok') {
                        var v = this.inputName.getValue();
                        if (!v || v.trim().length === 0) {
                            return; // block close; user must enter something
                        }
                    }
                    this._handleOk(state);
                },

                _handleOk: function() {
                    var v = this.inputName.getValue();
                    var state = arguments.length > 0 ? arguments[0] : 'ok';
                    this.close();
                    onResult(state === 'ok' ? v.trim() : null);
                }
            }));

            var win = new PromptDialog({title: caption});
            win.show();
        },
        onClickClosePanel: function() {
            Common.NotificationCenter.trigger('leftmenu:change', 'hide');
        },

        onMenuSettingsItemClick: function (menu, item){
            switch (item.value){
                case 'expand':
                    this.panelNavigation.viewNavigationList.expandAll();
                    break;
                case 'collapse':
                    this.panelNavigation.viewNavigationList.collapseAll();
                    break;
                case 'wrap':
                    this.panelNavigation.changeWrapHeadings();
                    break;
            }
        },

        onMenuLevelsItemClick: function (menu, item) {
            this.panelNavigation.viewNavigationList.expandToLevel(item.value-1);
        },

        onMenuFontSizeClick: function (menu, item){
            this.panelNavigation.changeFontSize(item.value);
        },

        SetDisabled: function(state) {
            this._isDisabled = state;
        },

        updateViewerNavigation: function (bookmarks) {
            this._viewerNavigationObject = bookmarks.length > 0 ? bookmarks : null;
            if (this._viewerNavigationObject) {
                var count = this._viewerNavigationObject.length,
                    prev_level = -1,
                    header_level = -1,
                    first_header = true,//!this._navigationObject.isFirstItemNotHeader(),
                    arr = [];
                for (var i = 0; i < count; i++) {
                    var level = this._viewerNavigationObject[i].level - 1,
                        hasParent = true;
                    if (level > prev_level && i > 0)
                        arr[i - 1].set('hasSubItems', true);
                    if (header_level < 0 || level <= header_level) {
                        if (i > 0 || first_header)
                            header_level = level;
                        hasParent = false;
                    }
                    arr.push(new Common.UI.TreeViewModel({
                        name: this._viewerNavigationObject[i].description,
                        level: level,
                        index: i,
                        hasParent: hasParent,
                        isEmptyItem: !this._viewerNavigationObject[i].description
                    }));
                    prev_level = level;
                }
                if (count > 0 && !first_header) {
                    arr[0].set('hasSubItems', false);
                    arr[0].set('isNotHeader', true);
                    arr[0].set('name', this.txtBeginning);
                    arr[0].set('tip', this.txtGotoBeginning);
                    arr[0].set('getTipFromName', false);
                }
                this.getApplication().getCollection('Navigation').reset(arr);
                if (this.panelNavigation && this.panelNavigation.viewNavigationList && this.panelNavigation.viewNavigationList.scroller)
                    this.panelNavigation.viewNavigationList.scroller.update({alwaysVisibleY: true});
            } else {
                // Structure became empty (all bookmarks deleted): reset the collection
                // too, otherwise the tree keeps rendering the stale rows — the delete
                // looks like a no-op in the UI even though the data change went through.
                if (this.getApplication()) {
                    this.getApplication().getCollection('Navigation').reset([]);
                }
                if (this.panelNavigation && this.panelNavigation.viewNavigationList && this.panelNavigation.viewNavigationList.scroller)
                    this.panelNavigation.viewNavigationList.scroller.update({alwaysVisibleY: true});
            }
        },

        txtBeginning: 'Beginning of document',
        txtGotoBeginning: 'Go to the beginning of the document',
        txtAddBookmark: 'Add Bookmark',
        txtRenameBookmark: 'Rename Bookmark',
        txtNewBookmark: 'New Bookmark',
        txtBookmarkName: 'Bookmark name'

    }, PDFE.Controllers.Navigation || {}));
});
