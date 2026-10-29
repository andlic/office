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
 *  HyperlinkSettingsDialog.js
 *
 *  Created on 04/23/24
 *
 */


if (Common === undefined)
    var Common = {};

var c_oHyperlinkType = {
    InternalLink:0,
    WebLink: 1
};

define([], function () { 'use strict';

    PDFE.Views.HyperlinkSettingsDialog = Common.UI.Window.extend(_.extend({

        initialize : function(options) {
            var _options = {};
            _.extend(_options, {
                title: this.textTitle,
                width: 350,
                style: 'min-width: 230px;',
                cls: 'modal-dlg',
                id: 'window-hyperlink-settings',
                buttons: ['ok', 'cancel']
            }, options || {});

            this.template = [
                '<div class="box" style="height: ' + (options.isAnnotation ? 280 : 330) + 'px;">',
                    '<div style="margin-bottom: 10px;">',
                        '<button type="button" class="btn btn-text-default auto" id="id-dlg-hyperlink-external">', this.textExternalLink,'</button>',
                        '<button type="button" class="btn btn-text-default auto" id="id-dlg-hyperlink-internal">', this.textInternalLink,'</button>',
                    '</div>',
                    '<div id="id-external-link">',
                        '<div class="input-row">',
                            '<label>' + this.strLinkTo + '</label>',
                        '</div>',
                        '<div id="id-dlg-hyperlink-url" class="input-row" style="margin-bottom: 5px;"></div>',
                    '</div>',
                    '<div id="id-internal-link" class="hidden">',
                        '<div class="input-row">',
                            '<label>' + this.strLinkTo + '</label>',
                        '</div>',
                        '<div id="id-dlg-hyperlink-list" style="width:100%; height: 171px;"></div>',
                        '<div id="id-dlg-hyperlink-chb-page" class="input-row" style="margin-top: 15px;"></div>',
                    '</div>',
                    '<div class="input-row not-annotation">',
                        '<label>' + this.strDisplay + '</label>',
                    '</div>',
                    '<div id="id-dlg-hyperlink-display" class="input-row not-annotation" style="margin-bottom: 5px;"></div>',
                    '<div class="input-row not-annotation">',
                        '<label>' + this.textTipText + '</label>',
                    '</div>',
                    '<div id="id-dlg-hyperlink-tip" class="input-row not-annotation" style="margin-bottom: 5px;"></div>',
                '</div>'
            ].join('');

            _options.tpl = _.template(this.template)(_options);
            this.slides = _options.slides;
            this.api = _options.api;
            this.urlType = AscCommon.c_oAscUrlType.Invalid;
            this.appOptions = _options.appOptions;
            this.isAnnotation = !!_options.isAnnotation;
            this._ectdSelectedHref = null;
            this._ectdSelectedDest = null;
            // Set when the dialog was opened on an existing eCTD file link whose
            // value the engine could not expose (saved /GoToR, /Launch).
            this._ectdOpenedLink = null;

            Common.UI.Window.prototype.initialize.call(this, _options);
        },

        render: function() {
            Common.UI.Window.prototype.render.call(this);

            var me = this,
                $window = this.getChild();

            me.btnExternal = new Common.UI.Button({
                el: $('#id-dlg-hyperlink-external'),
                enableToggle: true,
                toggleGroup: 'hyperlink-type',
                allowDepress: false,
                pressed: true
            });
            me.btnExternal.on('click', _.bind(me.onLinkTypeClick, me, c_oHyperlinkType.WebLink));

            me.btnInternal = new Common.UI.Button({
                el: $('#id-dlg-hyperlink-internal'),
                enableToggle: true,
                toggleGroup: 'hyperlink-type',
                allowDepress: false
            });
            me.btnInternal.on('click', _.bind(me.onLinkTypeClick, me, c_oHyperlinkType.InternalLink));

            Common.UI.GroupedButtons([me.btnExternal, me.btnInternal]);

            var config = {
                el          : $('#id-dlg-hyperlink-url'),
                allowBlank  : false,
                blankError  : me.txtEmpty,
                validateOnBlur: false,
                style       : 'width: 100%;',
                iconCls: 'toolbar__icon btn-browse',
                // 输入框始终可手工输入链接；末尾的浏览按钮是否显示见下方渲染逻辑。
                placeHolder: me.txtUrlPlaceholder,
                btnHint: me.textSelectFile,
                validation  : function(value) {
                    var trimmed = value.trim();
                    if (trimmed.length>2083) return me.txtSizeLimit;

                    me.urlType = me.api.asc_getUrlType(trimmed);
                    if (me.urlType!==AscCommon.c_oAscUrlType.Invalid)
                        return true;
                    // eCTD file links picked from the document tree are relative paths
                    // ("./m2/2.3-quality-overall-summary.pdf", "../m1/1.2-cover-letter/cover.pdf").
                    if (me.isRelativeFilePath(trimmed) || me._ectdIsRelPath(trimmed))
                        return true;
                    // A saved leaf-ID link keeps its internal ID when the host cannot
                    // resolve it (or the user confirms before the response arrives).
                    var opened = me._ectdOpenedLink;
                    if (opened && opened.leafId && trimmed === opened.leafId)
                        return true;
                    return me.txtNotUrl;
                }
            };
            me.inputUrl = new Common.UI.InputFieldBtn(config);

            // 文件选择入口只在"有文件可选"时提供：桌面端走原生文件对话框；
            // 浏览器端必须由宿主下发完整的 eCTD 配置。未配置时按钮隐藏，用户仍可手工输入链接。
            if (!(me.appOptions && me.appOptions.isDesktopApp) && !ECtDApi.isConfigured())
                me.inputUrl.cmpEl.find('.select-button').hide();

            me.inputUrl._input.on('input', function (e) {
                me.isInputFirstChange && me.inputUrl.showError();
                me.isInputFirstChange = false;
                var val = $(e.target).val();
                if (me.isAutoUpdate) {
                    me.inputDisplay.setValue(val);
                    me.isTextChanged = true;
                }
                me.btnOk.setDisabled(val.trim()=='');
            });
            me.inputUrl.on('button:click', _.bind(me.onSelectFile, me));

            me.inputDisplay = new Common.UI.InputField({
                el          : $('#id-dlg-hyperlink-display'),
                allowBlank  : true,
                validateOnBlur: false,
                style       : 'width: 100%;'
            }).on('changed:after', function() {
                me.isTextChanged = true;
            });
            me.inputDisplay._input.on('input', function (e) {
                me.isAutoUpdate = ($(e.target).val()=='');
            });

            me.inputTip = new Common.UI.InputField({
                el          : $('#id-dlg-hyperlink-tip'),
                style       : 'width: 100%;',
                maxLength   : Asc.c_oAscMaxTooltipLength
            });

            me.internalList = new Common.UI.TreeView({
                el: $('#id-dlg-hyperlink-list'),
                store: new Common.UI.TreeViewStore(),
                enableKeyEvents: true,
                tabindex: 1
            });
            me.internalList.on('item:select', _.bind(this.onSelectItem, this));

            me.chPageView = new Common.UI.CheckBox({
                el: $window.find('#id-dlg-hyperlink-chb-page'),
                labelText: this.txtPageView
            }).on('change', function(field, newValue, oldValue, eOpts){
                me.internalList.setDisabled(newValue==='checked');
                var rec = me.internalList.getSelectedRec();
                me.btnOk.setDisabled((!rec || rec.get('index')==4) && (newValue!=='checked'));
            });

            me.btnOk = _.find(this.getFooterButtons(), function (item) {
                return (item.$el && item.$el.find('.primary').addBack().filter('.primary').length>0);
            }) || new Common.UI.Button({ el: $window.find('.primary') });
            me.btnOk.setDisabled(true);

            $window.find('.dlg-btn').on('click', _.bind(this.onBtnClick, this));
            me.internalList.on('entervalue', _.bind(me.onPrimary, me));
            me.externalPanel = $window.find('#id-external-link');
            me.internalPanel = $window.find('#id-internal-link');

            if (me.isAnnotation) {
                $window.find('.not-annotation').addClass('hidden');
            } else
                me.chPageView.setVisible(false);
        },

        getFocusedComponents: function() {
            return [this.btnExternal, this.btnInternal, this.inputUrl, this.internalList, this.inputDisplay, this.inputTip, this.chPageView].concat(this.getFooterButtons());
        },

        setSettings: function (props, ectdRaw) {
            if (props) {
                var me = this;

                var type = me.parseUrl(props.get_Value());
                (type == c_oHyperlinkType.WebLink) ? me.btnExternal.toggle(true) : me.btnInternal.toggle(true);
                me.ShowHideElem(type, props.get_Value());
                
                if (props.get_Text()!==null) {
                    me.inputDisplay.setValue(props.get_Text());
                    me.inputDisplay.setDisabled(false);
                    me.isAutoUpdate = (me.inputDisplay.getValue()=='' || type == c_oHyperlinkType.WebLink && me.inputUrl.getValue()==me.inputDisplay.getValue());
                } else {
                    this.inputDisplay.setValue(this.textDefault);
                    this.inputDisplay.setDisabled(true);
                }
                this.isTextChanged = false;
                this.inputTip.setValue(props.get_ToolTip());

                this.isAnnotation && this.chPageView.setValue(props.get_PageView());
                me._originalProps = props;

                // Saved /GoToR and /Launch actions are not exposed by the engine;
                // the controller passes the original {file, dest} so the dialog
                // can show the file it points to (and keep /D unchanged).
                me._ectdInitExistingLink(props, ectdRaw);
            } else {
                this.btnExternal.toggle(true);
                this.ShowHideElem(c_oHyperlinkType.WebLink);
            }
        },

        getSettings: function () {
            var me      = this,
                props   = new Asc.CHyperlinkProperty();
            var def_display = '',
                type = this.btnExternal.isActive() ? c_oHyperlinkType.WebLink : c_oHyperlinkType.InternalLink;
            if (type==c_oHyperlinkType.InternalLink) {//InternalLink
                var url = "ppaction://hlink";
                var tip = '';
                var txttip = me.inputTip.getValue();
                var rec = this.internalList.getSelectedRec();
                if (rec) {
                    url = url + rec.get('type');
                    tip = rec.get('tiptext');
                }
                props.put_Value( url );
                !this.isAnnotation && props.put_ToolTip(_.isEmpty(txttip) ? tip : txttip);
                def_display = tip;
            } else {
                var url = me.inputUrl.getValue().trim();
                if (me.urlType!==AscCommon.c_oAscUrlType.Unsafe && ! /(((^https?)|(^ftp)):\/\/)|(^mailto:)/i.test(url)
                        && !me.isRelativeFilePath(url) && !me._ectdIsRelPath(url)
                        && !me._ectdIsLeafId(url) )
                    url = ( (me.urlType==AscCommon.c_oAscUrlType.Email) ? 'mailto:' : 'http://' ) + url;
                url = url.replace(new RegExp("%20",'g')," ");
                props.put_Value( url );
                // Opened on a saved leaf-ID link and left unchanged: keep storing
                // the leaf ID in /F (the host replaces it with the published path
                // when publishing).
                if (me._ectdOpenedLink && me._ectdOpenedLink.href &&
                    me._normalizePickedHref(me._ectdOpenedLink.href) === url) {
                    props.put_Value(me._ectdOpenedLink.leafId);
                }
                // Host-provided destination survives only if the URL is still exactly
                // what the picker returned (a manual edit drops it).
                if (me._ectdSelectedDest && me._ectdSelectedHref &&
                    me._normalizePickedHref(me._ectdSelectedHref) === url) {
                    props.put_Dest(me._ectdSelectedDest);
                }
                !this.isAnnotation && props.put_ToolTip(me.inputTip.getValue());
                def_display = url;
            }

            if (!me.inputDisplay.isDisabled() && (me.isTextChanged || _.isEmpty(me.inputDisplay.getValue()))) {
                if (_.isEmpty(me.inputDisplay.getValue()) || type==c_oHyperlinkType.WebLink && me.isAutoUpdate)
                    me.inputDisplay.setValue(def_display);
                !this.isAnnotation && props.put_Text(me.inputDisplay.getValue());
            }
            else
                !this.isAnnotation && props.put_Text(null);

            return props;
        },

        onBtnClick: function(event) {
            if (event.currentTarget && event.currentTarget.attributes['result'])
                this._handleInput(event.currentTarget.attributes['result'].value);
        },

        onPrimary: function(event) {
            this._handleInput('ok');
            return false;
        },

        _handleInput: function(state) {
            if (state === 'ok' && this.btnOk.isDisabled())
                return;

            if (this.options.handler) {
                if (state == 'ok') {
                    if (this.isAnnotation && this.btnInternal.isActive() && this.chPageView.getValue()==='checked') {
                        var me = this;
                        me.hide();

                        Common.NotificationCenter.trigger('editing:disable', true, {
                            viewMode: true,
                            allowSignature: false,
                            statusBar: true,
                            rightMenu: {clear: true, disable: true},
                            leftMenu: {disable: true, previewMode: true},
                            fileMenu: {protect: true},
                            navigation: {disable: true, previewMode: true},
                            comments: {disable: true, previewMode: true},
                            chat: true,
                            viewport: true,
                            documentHolder: {clear: true, disable: true},
                            toolbar: true,
                            plugins: false,
                            header: {docmode: true, search: true},
                            shortcuts: true
                        }, 'setlink');
                        me.api.SetCanInteract(false);
                        Common.UI.alert({
                            modal: false,
                            maxwidth: 400,
                            title: this.txtCreateLink,
                            msg: this.txtCreateDesc,
                            buttons: [  {caption: this.txtSetLink, primary: true, value: 'ok'},
                                'cancel'],
                            callback: function(btn){
                                if (btn === 'ok') {
                                    me.options.handler.call(me, me, 'view');
                                }
                                me.close();
                                Common.NotificationCenter.trigger('editing:disable', false, {
                                    viewMode: false,
                                    allowSignature: false,
                                    statusBar: true,
                                    rightMenu: {clear: true, disable: true},
                                    leftMenu: {disable: true, previewMode: true},
                                    fileMenu: {protect: true},
                                    navigation: {disable: true, previewMode: true},
                                    comments: {disable: true, previewMode: true},
                                    chat: true,
                                    viewport: true,
                                    documentHolder: {clear: true, disable: true},
                                    toolbar: true,
                                    plugins: false,
                                    header: {docmode: true, search: true},
                                    shortcuts: true
                                }, 'setlink');
                                me.api.SetCanInteract(true);
                            }
                        });
                        return;
                    }

                    var checkurl = (this.btnExternal.isActive()) ? this.inputUrl.checkValidate() : true;
                    if (checkurl !== true)  {
                        this.isInputFirstChange = true;
                        this.inputUrl.focus();
                        return;
                    }
                    if (!this.isAnnotation) {
                        var checkdisp = this.inputDisplay.checkValidate();
                        if (checkdisp !== true) {
                            this.inputDisplay.focus();
                            return;
                        }
                        !this._originalProps.get_Value() &&  Common.Utils.InternalSettings.set("pdfe-settings-link-type", this.btnInternal.isActive());
                    }
                }
                this.options.handler.call(this, this, state);
            }

            this.close();
        },

        ShowHideElem: function(value, url) {
            this.externalPanel.toggleClass('hidden', value !== c_oHyperlinkType.WebLink);
            this.internalPanel.toggleClass('hidden', value !== c_oHyperlinkType.InternalLink);
            if (value==c_oHyperlinkType.InternalLink) {
                if (url===null || url===undefined || url=='' )
                    url = "ppaction://hlinkshowjump?jump=firstslide";
                var store = this.internalList.store;
                if (store.length<1) {
                    var arr = [], i = 0;
                    arr.push(new Common.UI.TreeViewModel({
                        name : this.txtFirst,
                        level: 0,
                        index: i++,
                        hasParent: false,
                        isEmptyItem: false,
                        isNotHeader: true,
                        hasSubItems: false,
                        type: "showjump?jump=firstslide",
                        tiptext: this.txtFirst,
                        selected: url == "ppaction://hlinkshowjump?jump=firstslide"
                    }));
                    arr.push(new Common.UI.TreeViewModel({
                        name : this.txtLast,
                        level: 0,
                        index: i++,
                        hasParent: false,
                        isEmptyItem: false,
                        isNotHeader: true,
                        hasSubItems: false,
                        type: "showjump?jump=lastslide",
                        tiptext: this.txtLast,
                        selected: url == "ppaction://hlinkshowjump?jump=lastslide"
                    }));
                    arr.push(new Common.UI.TreeViewModel({
                        name : this.txtNext,
                        level: 0,
                        index: i++,
                        hasParent: false,
                        isEmptyItem: false,
                        isNotHeader: true,
                        hasSubItems: false,
                        type: "showjump?jump=nextslide",
                        tiptext: this.txtNext,
                        selected: url == "ppaction://hlinkshowjump?jump=nextslide"
                    }));
                    arr.push(new Common.UI.TreeViewModel({
                        name : this.txtPrev,
                        level: 0,
                        index: i++,
                        hasParent: false,
                        isEmptyItem: false,
                        isNotHeader: true,
                        hasSubItems: false,
                        type: "showjump?jump=previousslide",
                        tiptext: this.txtPrev,
                        selected: url == "ppaction://hlinkshowjump?jump=previousslide"
                    }));
                    arr.push(new Common.UI.TreeViewModel({
                        name : this.textPages,
                        level: 0,
                        index: i++,
                        hasParent: false,
                        isEmptyItem: false,
                        isNotHeader: true,
                        hasSubItems: this.api.getCountPages()>0
                    }));
                    var mask = "ppaction://hlinksldjumpslide",
                        indSlide = url.indexOf(mask),
                        slideNum = (0 == indSlide) ? parseInt(url.substring(mask.length)) : -1;
                    for (var i=0; i<this.api.getCountPages(); i++) {
                        arr.push(new Common.UI.TreeViewModel({
                            name : this.txtPage + ' ' + (i+1),
                            level: 1,
                            index: arr.length,
                            hasParent: false,
                            isEmptyItem: false,
                            isNotHeader: true,
                            hasSubItems: false,
                            type: 'sldjumpslide' + i,
                            tiptext: this.txtPage + ' ' + (i+1),
                            selected: i==slideNum
                        }));
                    }
                    store.reset(arr);
                }
                var rec = this.internalList.getSelectedRec();
                rec && this.internalList.scrollToRecord(rec);
                this.btnOk.setDisabled((!rec || rec.get('index')==4) && !(this.isAnnotation && this.chPageView.getValue()==='checked'));
                var me = this;
                _.delay(function(){
                    me.inputDisplay.focus();
                },50);
            } else {
                this.btnOk.setDisabled(this.inputUrl.getValue().trim()=='');
                var me = this;
                _.delay(function(){
                    me.inputUrl.focus();
                },50);
            }
        },

        onLinkTypeClick: function(type, btn, event) {
            this.ShowHideElem(type);
            if (this.isAutoUpdate) {
                if (type==c_oHyperlinkType.InternalLink) {
                    var rec = this.internalList.getSelectedRec();
                    this.inputDisplay.setValue(rec && (rec.get('level') || rec.get('index')<4) ? rec.get('name') : '');
                } else {
                    this.inputDisplay.setValue(this.inputUrl.getValue());
                }
                this.isTextChanged = true;
            }
        },

        parseUrl: function(url) {
            if (url===null || url===undefined || url=='' )
                return Common.Utils.InternalSettings.get("pdfe-settings-link-type") ? c_oHyperlinkType.InternalLink : c_oHyperlinkType.WebLink;

            var indAction = url.indexOf("ppaction://hlink");
            if (0 == indAction)
            {
                return c_oHyperlinkType.InternalLink;
            } else  {
                this.inputUrl.setValue(url ? url.replace(new RegExp(" ",'g'), "%20") : '');
                return c_oHyperlinkType.WebLink;
            }
        },

        onSelectItem: function(picker, item, record, e){
            if (!record) return;
            this.btnOk.setDisabled(record.get('index')==4 && !(this.isAnnotation && this.chPageView.getValue()==='checked'));
            if (this.isAutoUpdate) {
                this.inputDisplay.setValue((record.get('level') || record.get('index')<4) ? record.get('name') : '');
                this.isTextChanged = true;
            }
        },

        onSelectFile: function() {
            var me = this;
            if (!me.api) return;

            // Desktop app: native "open file" dialog through the SDK bridge (existing flow).
            if (me.appOptions && me.appOptions.isDesktopApp) {
                me.api.asc_getFilePath(function(result) {
                    me._applySelectedFile(result);
                });
                return;
            }

            // Browser, host-owned UI: customization.ectd.pickerUrl points to a host page
            // rendered in an iframe. The host owns the data source AND the picker UI;
            // the editor only relays the current document context and applies the result.
            var hostPicker = ECtDApi.getPicker();
            if (hostPicker) {
                new PDFE.Views.ECtDHostPickerDialog({
                    api: me.api,
                    pickerUrl: hostPicker.url,
                    pickerOrigin: hostPicker.origin,
                    pickerWidth: hostPicker.width,
                    pickerHeight: hostPicker.height,
                    handler: function(dlg, href, dest) {
                        dlg.close();
                        me._applySelectedFile(href, dest);
                    }
                }).show();
                return;
            }

            // Browser, built-in UI: pick a file from the host-provided eCTD tree
            // (customization.ectd.treeUrl). Without any eCTD configuration there is no
            // file picker — only manual link input.
            if (!ECtDApi.isConfigured()) return;

            var picker = new PDFE.Views.ECtDFilePickerDialog({
                api: me.api,
                handler: function(dlg, relativePath) {
                    dlg.close();
                    me._applySelectedFile(relativePath);
                }
            });
            picker.fetchAndRender();
        },

        // Shared result handling for the desktop file dialog and the eCTD picker.
        // `dest` is the optional host-supplied GoToR destination (PDF targets only);
        // it is applied only while the URL field still holds the picked href.
        _applySelectedFile: function(result, dest) {
            var me = this;
            if (!result) return;
            me.inputUrl.setValue(result);
            if (me.inputUrl.checkValidate() !== true)
                me.isInputFirstChange = true;
            if (me.isAutoUpdate) {
                me.inputDisplay.setValue(result);
                me.isTextChanged = true;
            }
            me._ectdSelectedHref = dest ? String(result).trim() : null;
            me._ectdSelectedDest = dest || null;
            // An explicit picker choice always applies, even if it resolves to
            // the same displayed path.
            me._ectdOpenedLink = null;
            me.btnOk.setDisabled(result.trim()=='');
        },

        _normalizePickedHref: function(value) {
            return (value || '').trim().replace(new RegExp("%20", 'g'), " ");
        },

        // A relative file path carries no scheme and starts with "./", "../" or "/".
        isRelativeFilePath: function(value) {
            if (!value) return false;
            if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(value)) return false; // "http:", "mailto:", ...
            return /^(\.\.?\/|\/)/.test(value) && value.indexOf('\\') === -1;
        },

        // ---- eCTD file links ---------------------------------------------------
        // The native reader drops /GoToR and /Launch actions, so reopening a saved
        // link leaves props.get_Value() empty. DocumentHolderExt passes the raw
        // {file, dest}; the file is a leaf ID (saved by the host), a published
        // relative path, or a legacy backslash path. Only leaf IDs are resolved.
        _ectdLeafIdRe: /^l-[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
        _ectdRelPathRe: /^(?:\.\.?\/|\/?@\d+\/)/,
        _ectdLegacyPathRe: /^(?:\.\.?\\|\/?@\d+\\)/,

        _ectdIsLeafId: function(value) {
            return typeof value === 'string' && this._ectdLeafIdRe.test(value);
        },

        _ectdIsRelPath: function(value) {
            return typeof value === 'string' && this._ectdRelPathRe.test(value);
        },

        _ectdIsLegacyPath: function(value) {
            return typeof value === 'string' && this._ectdLegacyPathRe.test(value);
        },

        _ectdGetController: function() {
            try {
                return (PDFE.getController && PDFE.getController('DocumentHolder')) || null;
            } catch (e) {
                return null;
            }
        },

        _ectdInitExistingLink: function(props, ectdRaw) {
            var me = this;
            if (!props || !ECtDApi._config())
                return;

            var value = props.get_Value();
            var fromRaw = false;
            if (!value && ectdRaw && typeof ectdRaw.file === 'string' && ectdRaw.file) {
                value = ectdRaw.file;
                fromRaw = true;
            }
            if (!value)
                value = props.get_ToolTip();
            if (typeof value !== 'string' || !value)
                return;

            var target = value.trim();
            var dest = (ectdRaw && ectdRaw.dest) || null;

            if (me._ectdIsLeafId(target)) {
                // A leaf ID is internal: surface it only when the host can turn it
                // into the published path. Without resolveUrl keep the old dialog.
                var dh = me._ectdGetController();
                if (!dh || !dh._ectdResolveTarget || !dh._ectdGetResolveUrl ||
                    !dh._ectdGetResolveUrl())
                    return;

                me.btnExternal.toggle(true);
                me.ShowHideElem(c_oHyperlinkType.WebLink, target);
                me.inputUrl.setValue(target);
                me.btnOk.setDisabled(false);
                me._ectdSelectedHref = target;
                me._ectdSelectedDest = dest;
                me._ectdOpenedLink = {leafId: target, href: null, shown: target};

                dh._ectdResolveTarget({kind: 'leaf', key: target, value: target})
                    .then(function(entry) {
                        // Do not overwrite a value the user already edited.
                        if (!me.inputUrl || me.inputUrl.getValue().trim() !== target)
                            return;
                        me.inputUrl.setValue(entry.href);
                        me.btnOk.setDisabled(entry.href.trim() === '');
                        me._ectdSelectedHref = entry.href;
                        me._ectdOpenedLink.href = entry.href;
                        me._ectdOpenedLink.shown = entry.href;
                    })
                    .catch(function() {
                        // Host unavailable: keep the leaf ID visible. Confirming
                        // without edits still keeps the original action.
                    });
                return;
            }

            // props.get_Value() is already displayed by parseUrl(); only values
            // recovered from the raw action / tooltip need to be filled in here.
            if (value !== props.get_Value() &&
                (me._ectdIsRelPath(target) || me._ectdIsLegacyPath(target))) {
                me.btnExternal.toggle(true);
                me.ShowHideElem(c_oHyperlinkType.WebLink, target);
                me.inputUrl.setValue(target);
                me.btnOk.setDisabled(target === '');
                if (fromRaw) {
                    // Same contract as the picker: /D survives only while the
                    // field still holds this path.
                    me._ectdSelectedHref = target;
                    me._ectdSelectedDest = dest;
                    me._ectdOpenedLink = {leafId: null, href: null, shown: target};
                }
            }
        },

        // True when the dialog was opened on a saved eCTD file link and its target
        // was not edited. The caller then leaves the original annotation untouched:
        // recreating it from the displayed value would write a leaf ID as /URI and
        // would rebuild /D from lossy getters (null would become 0).
        isEctdLinkUnchanged: function() {
            var opened = this._ectdOpenedLink;
            if (!opened || !this.btnExternal.isActive())
                return false;
            var current = this._normalizePickedHref(this.inputUrl.getValue());
            return current === this._normalizePickedHref(opened.shown);
        },

        textTitle:          'Hyperlink Settings',
        textInternalLink:   'Place in Document',
        textExternalLink:   'External Link',
        textEmptyLink:      'Enter link here',
        textEmptyDesc:      'Enter caption here',
        textEmptyTooltip:   'Enter tooltip here',
        txtPage:            'Page',
        strDisplay:         'Display',
        textTipText:        'Screen Tip Text',
        strLinkTo:          'Link To',
        txtEmpty:           'This field is required',
        txtNotUrl:          'This field should be a URL in the format \"http://www.example.com\"',
        txtNext:            'Next Page',
        txtPrev:            'Previous Page',
        txtFirst:           'First Page',
        txtLast:            'Last Page',
        textDefault:        'Selected text',
        textPages: 'Pages',
        txtSizeLimit: 'This field is limited to 2083 characters',
        txtUrlPlaceholder: 'Enter the web address or select a file',
        textSelectFile: 'Select file'
    }, PDFE.Views.HyperlinkSettingsDialog || {}))

    // ================================================================================
    //  eCTD file tree data source
    // ================================================================================
    //  数据归属：目录树属于【宿主应用】。宿主打开编辑器时通过嵌入配置下发接口地址：
    //
    //      editorConfig.customization.ectd = {
    //          treeUrl:             'https://host.example.com/api/ectd/files/tree',
    //          currentDocumentPath: 'm1 区域行政信息/1.2-封面信/xxx.pdf' // 正在编辑的文档在树中的路径
    //      };
    //
    //  fetchTree() GET treeUrl，期望 { "code": 0, "data": [ { "name", "children"? } ] }。
    //  鉴权走宿主自己的会话（cookie 随 credentials:'include' 携带）或 URL 中的令牌，
    //  这里只负责取数。
    //  行为约定：未下发配置 → 不提供文件选择入口，只能手工输入链接；
    //  已下发但拉取失败 → 对话框显示错误，绝不用假数据顶替。
    var ECtDApi = {
        _config: function() {
            try {
                var main = PDFE.getController && PDFE.getController('Main');
                var cust = main && main.editorConfig && main.editorConfig.customization;
                return (cust && cust.ectd) || null;
            } catch (e) { return null; }
        },
        // 选择文件入口的两种宿主模式：
        //   1. pickerUrl：宿主提供完整的选择器 UI（iframe 插槽，见 ECtDHostPickerDialog）；
        //   2. treeUrl + currentDocumentPath：内置树 UI + 宿主数据接口。
        // 都没有 → 未配置，按钮隐藏。
        isConfigured: function() {
            var cfg = this._config();
            if (!cfg) return false;
            if (this.getPicker()) return true;
            return !!(cfg.treeUrl && cfg.currentDocumentPath);
        },
        // 解析宿主 UI 模式配置。URL 非法或协议不对时返回 null，回退到内置树模式。
        getPicker: function() {
            var cfg = this._config();
            if (!cfg || typeof cfg.pickerUrl !== 'string' || !cfg.pickerUrl.trim()) return null;

            var url, origin;
            try {
                url = new URL(cfg.pickerUrl, window.location.href);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
                origin = url.origin;
                if (cfg.pickerOrigin) {
                    try { origin = new URL(cfg.pickerOrigin, window.location.href).origin; }
                    catch (e) { /* keep origin from pickerUrl */ }
                }
            } catch (e) {
                console.warn('eCTD pickerUrl is invalid:', cfg.pickerUrl, e);
                return null;
            }

            var width = parseInt(cfg.pickerWidth, 10);
            var height = parseInt(cfg.pickerHeight, 10);
            return {
                url: url.href,
                origin: origin,
                width: (width >= 320 && width <= 2000) ? width : 720,
                height: (height >= 240 && height <= 1200) ? height : 520
            };
        },
        // 宿主 UI 返回的链接目标只允许：http(s)/ftp/mailto 绝对地址，或以 /、./、../
        // 开头的相对路径。拒绝 javascript:/data: 等伪协议（getSettings 对 Unsafe
        // 类型会原样写入，必须在入口挡住）。
        isAllowedPickerHref: function(value) {
            if (typeof value !== 'string') return false;
            var href = value.trim();
            if (!href || href.length > 2083) return false;
            if (/[\u0000-\u001f\u007f]/.test(href)) return false;
            if (/^(https?|ftp|mailto):/i.test(href)) return true;
            return /^(\.\.?\/|\/)/.test(href) && href.indexOf('\\') === -1;
        },
        fetchTree: function() {
            var me = this;
            return new Promise(function(resolve, reject) {
                var cfg = me._config();
                if (!cfg || !cfg.treeUrl) { reject('ectd treeUrl not configured'); return; }
                fetch(cfg.treeUrl, {credentials: 'include'})
                    .then(function(r) {
                        if (!r.ok) throw new Error('HTTP ' + r.status);
                        return r.json();
                    })
                    .then(function(j) {
                        if (j && j.code === 0 && j.data && j.data.length) resolve(j.data);
                        else throw new Error('unexpected tree payload');
                    })
                    .catch(function(e) { reject(e); });
            });
        },
        getCurrentDocumentPath: function() {
            var cfg = this._config();
            return (cfg && cfg.currentDocumentPath) || '';
        },
        // 计算 toPath 相对 fromPath 的相对路径（两边均为 "a/b/c.pdf" 形式）。
        // 结果以 "./" 或 "../" 开头 —— 作为链接目标无歧义。
        getRelativePath: function(fromPath, toPath) {
            // 防御：isConfigured() 已保证 fromPath 非空，这里仅兜底。
            if (!fromPath) return '/' + toPath;
            var from = fromPath.split('/'); from.pop();          // 当前文件所在目录
            var to   = toPath.split('/');
            var i = 0;
            while (i < from.length && i < to.length - 1 && from[i] === to[i]) ++i;
            var parts = [];
            for (var u = i; u < from.length; ++u) parts.push('..');
            parts = parts.concat(to.slice(i));
            var rel = parts.join('/');
            return rel.indexOf('../') === 0 ? rel : './' + rel;
        }
    };

    // ================================================================================
    //  eCTD file picker dialog — TreeList of the m1-m5 document tree
    // ================================================================================
    PDFE.Views.ECtDFilePickerDialog = Common.UI.Window.extend(_.extend({
        initialize: function(options) {
            var _options = {};
            _.extend(_options, {
                title: this.txtTitle,
                width: 480,
                style: 'min-width: 320px;',
                cls: 'modal-dlg',
                id: 'window-ectd-file-picker',
                buttons: ['ok', 'cancel']
            }, options || {});
            this.handler = _options.handler;

            this.template = [
                '<div class="box" style="height: 380px;">',
                    '<div class="input-row">',
                        '<label>' + this.txtTip + '</label>',
                    '</div>',
                    '<div id="id-ectd-picker-loading" class="input-row">', this.txtLoading, '</div>',
                    '<div id="id-ectd-picker-list" style="width:100%; height: 320px;"></div>',
                '</div>'
            ].join('');
            _options.tpl = _.template(this.template)(_options);
            Common.UI.Window.prototype.initialize.call(this, _options);
        },

        render: function() {
            Common.UI.Window.prototype.render.call(this);

            var me = this,
                $window = this.getChild();

            me.tree = new Common.UI.TreeView({
                el: $('#id-ectd-picker-list'),
                store: new Common.UI.TreeViewStore(),
                enableKeyEvents: true,
                tabindex: 1
            });
            me.tree.on('item:select', _.bind(me.onSelectItem, me));
            me.tree.on('entervalue', _.bind(me.onPrimary, me));

            me.btnOk = _.find(this.getFooterButtons(), function (item) {
                return (item.$el && item.$el.find('.primary').addBack().filter('.primary').length>0);
            }) || new Common.UI.Button({ el: $window.find('.primary') });
            me.btnOk.setDisabled(true);

            $window.find('.dlg-btn').on('click', _.bind(function(event) {
                if (event.currentTarget && event.currentTarget.attributes['result'])
                    me._handleInput(event.currentTarget.attributes['result'].value);
            }, me));
        },

        // Show the dialog immediately (loading row visible), then fetch the tree.
        fetchAndRender: function() {
            var me = this;
            me.show();
            me._rowIndex = 0;
            var showTree = function(tree) {
                var arr = me._buildTreeModels(tree, 0, '');
                me.tree.store.reset(arr);
                $('#id-ectd-picker-loading').addClass('hidden');
            };
            ECtDApi.fetchTree().then(showTree).catch(function(e) {
                // 宿主接口不可达 / 返回格式不对：显示错误，绝不拿假数据顶替。
                $('#id-ectd-picker-loading')
                    .text(me.txtLoadError)
                    .removeClass('hidden');
                console.warn('eCTD tree load failed:', e);
            });
        },

        // Flatten the nested eCTD tree into the level-based row models the TreeView
        // component consumes (same pattern as the "Place in document" list).
        _buildTreeModels: function(nodes, level, prefix) {
            var arr = [];
            for (var k = 0; k < nodes.length; ++k) {
                var node = nodes[k],
                    isFolder = !!node.children,
                    full = prefix ? (prefix + '/' + node.name) : node.name;
                arr.push(new Common.UI.TreeViewModel({
                    name: node.name,
                    level: level,
                    index: this._rowIndex++,
                    hasParent: false,
                    isEmptyItem: false,
                    isNotHeader: true,
                    hasSubItems: isFolder && node.children.length > 0,
                    isFile: !isFolder,
                    fullPath: full,
                    selected: false
                }));
                if (isFolder && node.children.length)
                    arr = arr.concat(this._buildTreeModels(node.children, level + 1, full));
            }
            return arr;
        },

        onSelectItem: function(picker, item, record) {
            if (!record) return;
            this._selectedRecord = record;
            this.btnOk.setDisabled(!record.get('isFile'));
        },

        onPrimary: function() {
            this._handleInput('ok');
            return false;
        },

        _handleInput: function(state) {
            if (state === 'ok') {
                if (this.btnOk.isDisabled()) return;
                var rec = this._selectedRecord;
                if (rec && rec.get('isFile')) {
                    var relativePath = ECtDApi.getRelativePath(
                        ECtDApi.getCurrentDocumentPath(), rec.get('fullPath'));
                    this.handler && this.handler(this, relativePath);
                }
                return;
            }
            this.close();
        },

        txtTitle:   'Select file from eCTD',
        txtTip:     'Select the target file. The link will use a path relative to the current document.',
        txtLoading: 'Loading...',
        txtLoadError: 'Failed to load the file tree. Check the host interface configuration.'
    }, PDFE.Views.ECtDFilePickerDialog || {}))
    // ================================================================================
    //  eCTD host picker dialog — the whole file-selection UI is owned by the host app
    // ================================================================================
    //  customization.ectd.pickerUrl points to a host page rendered in an iframe inside
    //  this dialog. The page owns layout, data source and auth; the editor only relays
    //  the current document context and applies the selected link.
    //
    //  Protocol (all messages are objects with a `type` field):
    //    host  -> editor : {type:'ectd:ready'}
    //    editor-> host   : {type:'ectd:init', currentDocumentPath, lang}
    //    host  -> editor : {type:'ectd:select', href:'./m1/1.2/cover.pdf'}
    //                      {type:'ectd:select', path:'m1/1.2/cover.pdf'}  // editor computes the href
    //                      // PDF targets may also carry a /GoToR destination:
    //                      {type:'ectd:select', href:'...', dest:{page:2, type:'XYZ', ...}}
    //                      {type:'ectd:cancel'}
    //                      {type:'ectd:error', message:'...'}
    //    editor-> host   : {type:'ectd:invalid', reason:'...'}   // href rejected / path unusable
    //
    //  The editor accepts messages only from the picker iframe and only from
    //  pickerOrigin; outbound messages use targetOrigin = pickerOrigin (never '*').
    PDFE.Views.ECtDHostPickerDialog = Common.UI.Window.extend(_.extend({
        initialize: function(options) {
            options = options || {};
            var _options = {};
            _.extend(_options, {
                title: this.txtTitle,
                width: options.pickerWidth || 720,
                style: 'min-width: 320px;',
                cls: 'modal-dlg',
                id: 'window-ectd-host-picker',
                buttons: []
            }, options || {});
            this.handler = _options.handler;
            this.pickerUrl = _options.pickerUrl;
            this.pickerOrigin = _options.pickerOrigin;
            this.pickerHeight = _options.pickerHeight || 520;

            this.template = [
                '<div class="box" style="height:' + this.pickerHeight + 'px; display:flex; flex-direction:column;">',
                    '<div id="id-ectd-host-loading" class="input-row">' + this.txtLoading + '</div>',
                    '<div id="id-ectd-host-error" class="input-row hidden"></div>',
                    '<iframe id="id-ectd-host-frame" src="' + _.escape(this.pickerUrl) + '" ',
                        'style="flex:1; width:100%; border:0; background:#fff;" ',
                        'title="' + _.escape(this.txtTitle) + '"></iframe>',
                '</div>'
            ].join('');
            _options.tpl = _.template(this.template)(_options);
            Common.UI.Window.prototype.initialize.call(this, _options);
        },

        render: function() {
            Common.UI.Window.prototype.render.call(this);

            var me = this;
            me.frame = me.getChild('#id-ectd-host-frame')[0];
            if (!me.frame) return;

            me._onMessage = _.bind(me.onMessage, me);
            me._onFrameLoad = _.bind(me.onFrameLoad, me);
            window.addEventListener('message', me._onMessage);
            me.frame.addEventListener('load', me._onFrameLoad);
            me.on('close', _.bind(me.onWindowClose, me));
        },

        onWindowClose: function() {
            if (this._onMessage) window.removeEventListener('message', this._onMessage);
            if (this.frame && this._onFrameLoad) this.frame.removeEventListener('load', this._onFrameLoad);
            this._onMessage = null;
            this._onFrameLoad = null;
        },

        onFrameLoad: function() {
            this.getChild('#id-ectd-host-loading').addClass('hidden');
            this.postInit();
        },

        postInit: function() {
            this._postToHost('ectd:init', {
                currentDocumentPath: ECtDApi.getCurrentDocumentPath(),
                lang: (Common.Locale && Common.Locale.getCurrentLanguage && Common.Locale.getCurrentLanguage()) || 'en'
            });
        },

        _postToHost: function(type, payload) {
            if (!this.frame || !this.frame.contentWindow) return;
            var msg = _.extend({type: type}, payload || {});
            try {
                this.frame.contentWindow.postMessage(msg, this.pickerOrigin);
            } catch (e) {
                console.warn('eCTD host picker postMessage failed:', e);
            }
        },

        onMessage: function(event) {
            if (!this.frame || event.source !== this.frame.contentWindow) return;
            if (event.origin !== this.pickerOrigin) return;

            var data = event.data;
            if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;

            switch (data.type) {
                case 'ectd:ready':
                    // Host UI is ready (also covers the case where our load-time init was
                    // posted before the host listener existed).
                    this.postInit();
                    break;
                case 'ectd:select':
                    this._handleSelect(data);
                    break;
                case 'ectd:cancel':
                    this.close();
                    break;
                case 'ectd:error':
                    this._showError(data.message);
                    break;
            }
        },

        // The host may override the /GoToR destination for a PDF target:
        //   {page: <0-based>, type: 'XYZ'|'Fit'|'FitH'|'FitV'|'FitR'|'FitB'|'FitBH'|'FitBV',
        //    left, top, right, bottom, zoom}
        // Values use PDF destination semantics (default user space). Missing type
        // means XYZ. Returns a normalized destination or null when it is invalid.
        _normalizeHostDest: function(dest) {
            if (!dest || typeof dest !== 'object')
                return null;

            var page = dest.page;
            if (typeof page !== 'number' || !isFinite(page) || page < 0 || Math.floor(page) !== page)
                return null;

            var types = {XYZ:0, FIT:1, FITH:2, FITV:3, FITR:4, FITB:5, FITBH:6, FITBV:7};
            var type = String(dest.type || 'XYZ').toUpperCase();
            if (!Object.prototype.hasOwnProperty.call(types, type))
                return null;
            var kind = types[type];

            var toNumber = function(value) {
                if (value === undefined || value === null)
                    return null;
                return (typeof value === 'number' && isFinite(value)) ? value : undefined;
            };
            var left = toNumber(dest.left),
                top = toNumber(dest.top),
                right = toNumber(dest.right),
                bottom = toNumber(dest.bottom),
                zoom = toNumber(dest.zoom);

            if (left === undefined || top === undefined || right === undefined ||
                bottom === undefined || zoom === undefined)
                return null;

            // FitR requires all four corner values.
            if (kind === 4 && (left === null || top === null || right === null || bottom === null))
                return null;

            return {
                page: page, kind: kind,
                left: left, top: top, right: right, bottom: bottom, zoom: zoom
            };
        },

        // Destinations only make sense for a relative link to another PDF, i.e. the
        // links the editor writes as /GoToR. Absolute URLs stay /URI.
        _isPdfFileTarget: function(href) {
            if (typeof href !== 'string' || href.indexOf('\\') !== -1)
                return false;
            if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(href))
                return false;
            if (!/^(\.\.?\/|\/)/.test(href))
                return false;
            return /\.pdf$/i.test(href.split(/[?#]/)[0]);
        },

        _handleSelect: function(data) {
            var href = '';
            if (typeof data.href === 'string' && data.href.trim()) {
                // Host computed the final link target itself (recommended).
                href = data.href.trim();
            } else if (typeof data.path === 'string' && data.path.trim()) {
                // Host returned an eCTD path; compute the relative link here.
                var from = ECtDApi.getCurrentDocumentPath();
                if (!from) {
                    this._postToHost('ectd:invalid', {reason: 'currentDocumentPath is not configured'});
                    return;
                }
                href = ECtDApi.getRelativePath(from, data.path.trim());
            } else {
                this._postToHost('ectd:invalid', {reason: 'ectd:select requires href or path'});
                return;
            }

            if (!ECtDApi.isAllowedPickerHref(href)) {
                this._postToHost('ectd:invalid', {reason: 'unsupported link target'});
                return;
            }

            var dest = null;
            if (data.dest !== undefined && data.dest !== null) {
                if (!this._isPdfFileTarget(href)) {
                    this._postToHost('ectd:invalid', {reason: 'dest is only supported for PDF targets'});
                    return;
                }
                dest = this._normalizeHostDest(data.dest);
                if (!dest) {
                    this._postToHost('ectd:invalid', {reason: 'invalid dest'});
                    return;
                }
            }

            this.handler && this.handler(this, href, dest);
        },

        _showError: function(message) {
            this.getChild('#id-ectd-host-error')
                .text(message || this.txtLoadError)
                .removeClass('hidden');
        },

        txtTitle:   'Select file from eCTD',
        txtLoading: 'Loading...',
        txtLoadError: 'The host file picker reported an error.'
    }, PDFE.Views.ECtDHostPickerDialog || {}))
});