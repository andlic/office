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
 *  linkActions.js
 *
 *  Reads /GoToR and /Launch file specifications directly from the PDF bytes.
 *
 *  Why: the native PDF reader (core/PdfFile/SrcReader/PdfAnnot.cpp,
 *  CAnnotLink::getAction) drops these two action kinds, so
 *  CAnnotationLink::GetActions() returns an empty list for links to external
 *  files. The editor still needs the original /F value to show it in the
 *  link tooltip, so we extract it here from the already loaded file image.
 *
 *  This is a read-only helper: it never modifies the document. Only the small
 *  part of the PDF grammar that appears in link annotations is implemented.
 *
 *  Usage: AscPDF.ParseRawPdfLinkActions(uint8array)
 *      -> { <object number>: { S: 2|4, F: "..." } }
 *  Object numbers are the annotation object references, which is exactly what
 *  CAnnotationBase.GetApIdx() returns for annotations loaded from the file.
 */
"use strict";

(function(window, undefined) {

    //----------------------------------------------------------------------------------------
    // PDF lexical helpers
    //----------------------------------------------------------------------------------------
    var g_rawPdfWhitespace = { 0: true, 9: true, 10: true, 12: true, 13: true, 32: true };

    function RawPdfIsWhitespace(c)
    {
        return !!g_rawPdfWhitespace[c];
    }

    function RawPdfIsDelimiter(c)
    {
        return RawPdfIsWhitespace(c) || c === 0x28 || c === 0x29 || c === 0x3C || c === 0x3E ||
            c === 0x5B || c === 0x5D || c === 0x7B || c === 0x7D || c === 0x2F || c === 0x25;
    }

    function RawPdfLatin1(data, start, end)
    {
        var s = "";
        for (var i = start; i < end; i++)
            s += String.fromCharCode(data[i]);
        return s;
    }

    function RawPdfHexValue(c)
    {
        if (c >= 0x30 && c <= 0x39) return c - 0x30;
        if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10;
        if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10;
        return -1;
    }

    // Find an ASCII keyword (must start at a delimiter/whitespace boundary).
    function RawPdfFindKeyword(data, keyword, from, to)
    {
        var end = (undefined === to) ? data.length : to;
        var n = keyword.length;
        if (n === 0)
            return -1;

        var c0 = keyword.charCodeAt(0);
        for (var i = from; i + n <= end; i++)
        {
            if (data[i] !== c0)
                continue;
            if (i > 0 && !RawPdfIsDelimiter(data[i - 1]))
                continue;

            var matched = true;
            for (var j = 1; j < n; j++)
            {
                if (data[i + j] !== keyword.charCodeAt(j))
                {
                    matched = false;
                    break;
                }
            }
            if (matched)
                return i;
        }
        return -1;
    }

    // Decode a PDF text string: UTF-16 with BOM, UTF-8, or PDFDocEncoding/latin1.
    function RawPdfDecodeString(bytes)
    {
        if (!bytes || !bytes.length)
            return "";

        var i, out, c, cp, extra, k, cc;

        if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF)
        {
            out = "";
            for (i = 2; i + 1 < bytes.length; i += 2)
                out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
            return out;
        }
        if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE)
        {
            out = "";
            for (i = 2; i + 1 < bytes.length; i += 2)
                out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
            return out;
        }

        // Try UTF-8 first; fall back to latin1 when the bytes are not valid UTF-8.
        out = "";
        i = 0;
        while (i < bytes.length)
        {
            c = bytes[i++];
            if (c < 0x80)
            {
                out += String.fromCharCode(c);
                continue;
            }

            if (c >= 0xC2 && c <= 0xDF)      { extra = 1; cp = c & 0x1F; }
            else if (c >= 0xE0 && c <= 0xEF) { extra = 2; cp = c & 0x0F; }
            else if (c >= 0xF0 && c <= 0xF4) { extra = 3; cp = c & 0x07; }
            else
                return RawPdfLatin1(bytes, 0, bytes.length);

            if (i + extra > bytes.length)
                return RawPdfLatin1(bytes, 0, bytes.length);

            for (k = 0; k < extra; k++)
            {
                cc = bytes[i++];
                if ((cc & 0xC0) !== 0x80)
                    return RawPdfLatin1(bytes, 0, bytes.length);
                cp = (cp << 6) | (cc & 0x3F);
            }

            if (cp > 0xFFFF)
            {
                cp -= 0x10000;
                out += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
            }
            else
            {
                out += String.fromCharCode(cp);
            }
        }
        return out;
    }

    //----------------------------------------------------------------------------------------
    // Minimal PDF value parser
    //
    // Values are represented as:
    //   name   -> { n: "GoToR" }
    //   string -> { s: [byte, ...] }
    //   ref    -> { r: 12 }
    //   dict   -> { d: { key: value } }
    //   array  -> [value, ...]
    //   number -> Number, bool -> Boolean, null -> null
    //----------------------------------------------------------------------------------------
    function CRawPdfParser(data)
    {
        this.data   = data;
        this.length = data.length;
    }

    CRawPdfParser.prototype.skipWS = function(pos)
    {
        var data = this.data, len = this.length, c;
        while (pos < len)
        {
            c = data[pos];
            if (c === 0x25) // comment
            {
                pos++;
                while (pos < len && data[pos] !== 0x0A && data[pos] !== 0x0D)
                    pos++;
            }
            else if (RawPdfIsWhitespace(c))
            {
                pos++;
            }
            else
            {
                break;
            }
        }
        return pos;
    };

    CRawPdfParser.prototype.readNumber = function(pos)
    {
        var data = this.data, len = this.length, start = pos, hasDot = false, c;
        while (pos < len)
        {
            c = data[pos];
            if ((c >= 0x30 && c <= 0x39) || c === 0x2B || c === 0x2D)
                pos++;
            else if (c === 0x2E)
            {
                hasDot = true;
                pos++;
            }
            else
                break;
        }
        if (start === pos)
            return null;

        var value = parseFloat(RawPdfLatin1(data, start, pos));
        if (isNaN(value))
            return null;

        return { value: value, isInt: !hasDot, pos: pos };
    };

    CRawPdfParser.prototype.parseName = function(pos)
    {
        var data = this.data, len = this.length, chars = [], c, hi, lo;
        pos++; // '/'
        while (pos < len && !RawPdfIsDelimiter(data[pos]))
        {
            c = data[pos];
            if (c === 0x23 && pos + 2 < len) // '#XX'
            {
                hi = RawPdfHexValue(data[pos + 1]);
                lo = RawPdfHexValue(data[pos + 2]);
                if (hi >= 0 && lo >= 0)
                {
                    chars.push(String.fromCharCode(hi * 16 + lo));
                    pos += 3;
                    continue;
                }
            }
            chars.push(String.fromCharCode(c));
            pos++;
        }
        return { value: { n: chars.join("") }, pos: pos };
    };

    CRawPdfParser.prototype.parseLiteralString = function(pos)
    {
        var data = this.data, len = this.length, bytes = [], depth = 1, c, n, oct, count;
        pos++; // '('
        while (pos < len)
        {
            c = data[pos++];
            if (c === 0x5C) // backslash
            {
                if (pos >= len)
                    break;
                n = data[pos++];
                if (n === 0x6E)      bytes.push(10);
                else if (n === 0x72) bytes.push(13);
                else if (n === 0x74) bytes.push(9);
                else if (n === 0x62) bytes.push(8);
                else if (n === 0x66) bytes.push(12);
                else if (n === 0x28 || n === 0x29 || n === 0x5C) bytes.push(n);
                else if (n === 0x0D) { if (pos < len && data[pos] === 0x0A) pos++; } // line continuation
                else if (n === 0x0A) { /* line continuation */ }
                else if (n >= 0x30 && n <= 0x37)
                {
                    oct = n - 0x30;
                    count = 1;
                    while (count < 3 && pos < len && data[pos] >= 0x30 && data[pos] <= 0x37)
                    {
                        oct = oct * 8 + (data[pos] - 0x30);
                        pos++;
                        count++;
                    }
                    bytes.push(oct & 0xFF);
                }
                else
                    bytes.push(n);
            }
            else if (c === 0x28)
            {
                depth++;
                bytes.push(c);
            }
            else if (c === 0x29)
            {
                depth--;
                if (depth === 0)
                    break;
                bytes.push(c);
            }
            else if (c === 0x0D)
            {
                if (pos < len && data[pos] === 0x0A)
                    pos++;
                bytes.push(0x0A);
            }
            else
            {
                bytes.push(c);
            }
        }
        return { value: { s: bytes }, pos: pos };
    };

    CRawPdfParser.prototype.parseHexString = function(pos)
    {
        var data = this.data, len = this.length, bytes = [], hi = -1, v;
        pos++; // '<'
        while (pos < len && data[pos] !== 0x3E)
        {
            v = RawPdfHexValue(data[pos++]);
            if (v < 0)
                continue;
            if (hi < 0)
                hi = v;
            else
            {
                bytes.push(hi * 16 + v);
                hi = -1;
            }
        }
        if (hi >= 0)
            bytes.push(hi * 16);
        if (pos < len)
            pos++; // '>'
        return { value: { s: bytes }, pos: pos };
    };

    CRawPdfParser.prototype.parseArray = function(pos, depth)
    {
        var arr = [], item;
        pos++; // '['
        while (true)
        {
            pos = this.skipWS(pos);
            if (pos >= this.length)
                break;
            if (this.data[pos] === 0x5D)
            {
                pos++;
                break;
            }

            item = this.parseValue(pos, depth + 1);
            if (!item || item.pos <= pos)
                break;
            arr.push(item.value);
            pos = item.pos;
        }
        return { value: arr, pos: pos };
    };

    CRawPdfParser.prototype.parseDict = function(pos, depth)
    {
        var dict = {}, key, val;
        pos += 2; // '<<'
        while (true)
        {
            pos = this.skipWS(pos);
            if (pos >= this.length)
                break;
            if (this.data[pos] === 0x3E && this.data[pos + 1] === 0x3E)
            {
                pos += 2;
                break;
            }

            key = this.parseValue(pos, depth + 1);
            if (!key || !key.value || "string" !== typeof key.value.n)
                break;

            val = this.parseValue(key.pos, depth + 1);
            if (!val || val.pos <= key.pos)
                break;

            dict[key.value.n] = val.value;
            pos = val.pos;
        }
        return { value: { d: dict }, pos: pos };
    };

    CRawPdfParser.prototype.parseValue = function(pos, depth)
    {
        if (depth > 64)
            return null;

        var data = this.data, len = this.length, c, n, p, n2, p2, keyword;
        pos = this.skipWS(pos);
        if (pos >= len)
            return null;

        c = data[pos];
        if (c === 0x2F)
            return this.parseName(pos);
        if (c === 0x28)
            return this.parseLiteralString(pos);
        if (c === 0x3C)
        {
            if (pos + 1 < len && data[pos + 1] === 0x3C)
                return this.parseDict(pos, depth);
            return this.parseHexString(pos);
        }
        if (c === 0x5B)
            return this.parseArray(pos, depth);

        if ((c >= 0x30 && c <= 0x39) || c === 0x2B || c === 0x2D || c === 0x2E)
        {
            n = this.readNumber(pos);
            if (!n)
                return null;
            if (!n.isInt)
                return { value: n.value, pos: n.pos };

            // Indirect reference: "<num> <gen> R"
            p = this.skipWS(n.pos);
            n2 = this.readNumber(p);
            if (n2 && n2.isInt)
            {
                p2 = this.skipWS(n2.pos);
                if (p2 < len && data[p2] === 0x52 &&
                    (p2 + 1 >= len || RawPdfIsDelimiter(data[p2 + 1])))
                    return { value: { r: n.value }, pos: p2 + 1 };
            }
            return { value: n.value, pos: n.pos };
        }

        // Keyword (true / false / null / anything else)
        p = pos;
        while (p < len && !RawPdfIsDelimiter(data[p]))
            p++;
        if (p === pos)
            return null;

        keyword = RawPdfLatin1(data, pos, p);
        if (keyword === "true")  return { value: true,  pos: p };
        if (keyword === "false") return { value: false, pos: p };
        if (keyword === "null")  return { value: null,  pos: p };
        return { value: { k: keyword }, pos: p };
    };

    //----------------------------------------------------------------------------------------
    // Object scan
    //----------------------------------------------------------------------------------------

    // "n g obj" header preceding objPos, or null.
    function RawPdfReadObjectHeader(data, objPos)
    {
        var p = objPos - 1;

        if (p < 0 || !RawPdfIsWhitespace(data[p]))
            return null;
        while (p >= 0 && RawPdfIsWhitespace(data[p]))
            p--;

        var genEnd = p + 1;
        while (p >= 0 && data[p] >= 0x30 && data[p] <= 0x39)
            p--;
        var genStart = p + 1;
        if (genStart === genEnd)
            return null;

        if (p < 0 || !RawPdfIsWhitespace(data[p]))
            return null;
        while (p >= 0 && RawPdfIsWhitespace(data[p]))
            p--;

        var numEnd = p + 1;
        while (p >= 0 && data[p] >= 0x30 && data[p] <= 0x39)
            p--;
        var numStart = p + 1;
        if (numStart === numEnd)
            return null;

        if (p >= 0 && !RawPdfIsDelimiter(data[p]))
            return null;

        return parseInt(RawPdfLatin1(data, numStart, numEnd), 10);
    }

    // Object number -> offset of the object body. Only the headers are
    // walked here; objects referenced by a hovered annotation are parsed
    // on demand (a full parse of every object would stall the UI on large
    // documents, and only links are ever needed).
    CRawPdfParser.prototype.buildIndex = function()
    {
        if (this.offsets)
            return this.offsets;

        var data = this.data, len = this.length;
        var offsets = {}, pos = 0, objPos, after, objNum, endPos;

        while (pos < len)
        {
            objPos = RawPdfFindKeyword(data, "obj", pos);
            if (objPos < 0)
                break;

            after = objPos + 3;
            if (after < len && !RawPdfIsDelimiter(data[after]))
            {
                pos = after;
                continue;
            }

            objNum = RawPdfReadObjectHeader(data, objPos);
            if (null === objNum)
            {
                pos = after;
                continue;
            }

            // Incremental updates append newer revisions: the last one wins.
            offsets[objNum] = after;

            // Skip the object body (and any stream payload) as a block.
            endPos = RawPdfFindKeyword(data, "endobj", after);
            pos = (endPos < 0) ? after : endPos + 6;
        }

        this.offsets = offsets;
        return offsets;
    };

    CRawPdfParser.prototype.getObject = function(objNum)
    {
        var offsets = this.buildIndex();
        var pos = offsets[objNum];
        if (undefined === pos)
            return null;

        if (!this.objects)
            this.objects = {};
        if (undefined === this.objects[objNum])
        {
            var parsed = this.parseValue(pos, 0);
            this.objects[objNum] = (parsed && parsed.value && parsed.value.d) ? parsed.value : null;
        }
        return this.objects[objNum];
    };

    CRawPdfParser.prototype.resolve = function(value, depth)
    {
        depth = depth || 0;
        while (value && undefined !== value.r && depth < 16)
        {
            value = this.getObject(value.r);
            depth++;
        }
        return value;
    };

    // /F may be a string or a file specification dictionary (/UF is preferred
    // for non-ASCII names, /F is the fallback).
    CRawPdfParser.prototype.getFileSpecName = function(value)
    {
        value = this.resolve(value, 0);
        if (!value)
            return null;

        if (value.s)
            return RawPdfDecodeString(value.s);

        if (value.d)
        {
            var uf = this.resolve(value.d.UF, 0);
            if (uf && uf.s)
                return RawPdfDecodeString(uf.s);

            var f = this.resolve(value.d.F, 0);
            if (f && f.s)
                return RawPdfDecodeString(f.s);
        }

        return null;
    };

    CRawPdfParser.prototype.getActionFile = function(action)
    {
        action = this.resolve(action, 0);
        if (!action)
            return null;

        if (action instanceof Array)
        {
            for (var i = 0; i < action.length; i++)
            {
                var item = this.getActionFile(action[i]);
                if (item)
                    return item;
            }
            return null;
        }

        if (!action.d)
            return null;

        var s = this.resolve(action.d.S, 0);
        if (!s || ("GoToR" !== s.n && "Launch" !== s.n))
            return null;

        var file = this.getFileSpecName(action.d.F);
        if (!file)
            return null;

        return { S: ("GoToR" === s.n) ? 2 : 4, F: file };
    };

    // { S: 2|4, F: "..." } of the link annotation object, or null.
    CRawPdfParser.prototype.getLinkAction = function(objNum)
    {
        if (!this.linkActions)
            this.linkActions = {};
        if (objNum in this.linkActions)
            return this.linkActions[objNum];

        var result = null;
        var obj = this.getObject(objNum);
        if (obj && obj.d)
        {
            var sub = obj.d.Subtype;
            if (sub && "Link" === sub.n)
            {
                // /A is the action; fall back to the "mouse up" additional action.
                var action = obj.d.A;
                if (!action && obj.d.AA && obj.d.AA.d)
                    action = obj.d.AA.d.U;

                result = this.getActionFile(action);
            }
        }

        this.linkActions[objNum] = result;
        return result;
    };

    CRawPdfParser.prototype.parseLinkActions = function()
    {
        var offsets = this.buildIndex(), links = {}, file;
        for (var key in offsets)
        {
            file = this.getLinkAction(parseInt(key, 10));
            if (file)
                links[key] = file;
        }
        return links;
    };

    window["AscPDF"] = window["AscPDF"] || {};
    // One-shot bulk parse (used by tests/tools). The editor itself creates a
    // reader once per document and asks for annotations on demand.
    window["AscPDF"]["ParseRawPdfLinkActions"] = function(data)
    {
        if (!data || "string" === typeof data || !data.length)
            return {};
        try
        {
            return new CRawPdfParser(data).parseLinkActions();
        }
        catch (e)
        {
            return {};
        }
    };
    window["AscPDF"]["CreateRawPdfLinkActionReader"] = function(data)
    {
        if (!data || "string" === typeof data || !data.length)
            return null;
        return new CRawPdfParser(data);
    };

})(window, undefined);
