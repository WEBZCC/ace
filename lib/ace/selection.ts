/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

import lang = require("./lib/lang");
import { EventEmitter } from "./lib/event_emitter";
import { Range, Position } from "./range";
import { EditSession, MoveDirection } from "./edit_session";
import { Document } from "./document";
import { Anchor } from "./anchor";

interface OrientRange extends Range {
    cursor?: Position,
    desiredColumn?: number,
    isBackwards?: boolean
}

/**
 * Contains the cursor position and the text selection of an edit session.
 *
 * The row/columns used in the selection are in document coordinates representing the coordinates as they appear in the document before applying soft wrap and folding.
 * @class Selection
 **/


/**
 * Emitted when the cursor position changes.
 * @event changeCursor
 *
 **/
/**
 * Emitted when the cursor selection changes.
 * 
 *  @event changeSelection
 **/
/**
 * Creates a new `Selection` object.
 * @param {EditSession} session The session to use
 * 
 * @constructor
 **/
export class Selection extends EventEmitter {
    
    private $anchorChanged: boolean;
    private $desiredColumn: number;
    private $keepDesiredColumnOnChange: boolean;
    private $isEmpty: boolean;
    private $cursorChanged: boolean;
    private $silent: boolean;
    
    anchor: Anchor;
    lead: Anchor;
    cursor: Anchor;
    doc: Document;
    session: EditSession;
    inMultiSelectMode: boolean;

    // Multi Select
    rangeCount: number;
    ranges: OrientRange[];
    rangeList: {
        ranges: OrientRange[],
        detach: (session: EditSession) => void,
        attach: (session: EditSession) => void
    }
    
    constructor(session: EditSession) {
        super();

        this.session = session;
        this.doc = session.getDocument();

        this.clearSelection();
        this.cursor = this.lead = this.doc.createAnchor(0, 0);
        this.anchor = this.doc.createAnchor(0, 0);
        this.$silent = false;

        this.cursor.on("change", (e) => {
            this.$cursorChanged = true;
            if (!this.$silent)
                this._emit("changeCursor");
            if (!this.$isEmpty && !this.$silent)
                this._emit("changeSelection");
            if (!this.$keepDesiredColumnOnChange && e.old.column != e.value.column)
                this.$desiredColumn = null;
        });

        this.anchor.on("change", () => {
            this.$anchorChanged = true;
            if (!this.$isEmpty && !this.$silent)
                this._emit("changeSelection");
        });
    };
    
    /**
     * Returns `true` if the selection is empty.
     * @returns {Boolean}
     **/
    isEmpty() {
        return this.$isEmpty || (
            this.anchor.row == this.lead.row &&
            this.anchor.column == this.lead.column
        );
    };

    /**
     * Returns `true` if the selection is a multi-line.
     * @returns {Boolean}
     **/
    isMultiLine() {
        return !this.$isEmpty && this.anchor.row != this.cursor.row;
    };

    /**
     * Returns an object containing the `row` and `column` current position of the cursor.
     * @returns {Object}
     **/
    getCursor() {
        return this.lead.getPosition();
    };

    /**
     * Sets the row and column position of the anchor. This function also emits the `'changeSelection'` event.
     * @param {Number} row The new row
     * @param {Number} column The new column
     *
     **/
    setSelectionAnchor(row: number, column: number) {
        this.$isEmpty = false;
        this.anchor.setPosition(row, column);
    };

    /**
     * Returns an object containing the `row` and `column` of the calling selection anchor.
     *
     * @returns {Object}
     * @related Anchor.getPosition
     **/
    getAnchor: () => Position;
    getSelectionAnchor(): Position {
        if (this.$isEmpty)
            return this.getSelectionLead();
        
        return this.anchor.getPosition();
    };

    /**
     * Returns an object containing the `row` and `column` of the calling selection lead.
     * @returns {Object}
     **/
    getSelectionLead() {
        return this.lead.getPosition();
    };

    /**
     * Returns `true` if the selection is going backwards in the document.
     * @returns {Boolean}
     **/
    isBackwards() {
        var anchor = this.anchor;
        var lead = this.lead;
        return (anchor.row > lead.row || (anchor.row == lead.row && anchor.column > lead.column));
    };

    /**
     * [Returns the [[Range]] for the selected text.]{: #Selection.getRange}
     * @returns {Range}
     **/
    getRange() {
        var anchor = this.anchor;
        var lead = this.lead;

        if (this.$isEmpty)
            return Range.fromPoints(lead, lead);

        return this.isBackwards()
            ? Range.fromPoints(lead, anchor)
            : Range.fromPoints(anchor, lead);
    };

    /**
     * [Empties the selection (by de-selecting it). This function also emits the `'changeSelection'` event.]{: #Selection.clearSelection}
     **/
    clearSelection() {
        if (!this.$isEmpty) {
            this.$isEmpty = true;
            this._emit("changeSelection");
        }
    };

    /**
     * Selects all the text in the document.
     **/
    selectAll() {
        this.$setSelection(0, 0, Number.MAX_VALUE, Number.MAX_VALUE);
    };

    /**
     * Sets the selection to the provided range.
     * @param {Range} range The range of text to select
     * @param {Boolean} reverse Indicates if the range should go backwards (`true`) or not
     *
     * @method setSelectionRange
     * @alias setRange
     **/
    setRange: (range: Range, reverse?: boolean) => void;
    setSelectionRange(range: Range, reverse=false) {
        var start = reverse ? range.end : range.start;
        var end = reverse ? range.start : range.end;
        this.$setSelection(start.row, start.column, end.row, end.column);
    };

    $setSelection(anchorRow: number, anchorColumn: number, cursorRow: number, cursorColumn: number) {
        var wasEmpty = this.$isEmpty;
        this.$silent = true;
        this.$cursorChanged = this.$anchorChanged = false;
        this.anchor.setPosition(anchorRow, anchorColumn);
        this.cursor.setPosition(cursorRow, cursorColumn);
        this.$isEmpty = !Range.comparePoints(this.anchor, this.cursor);
        this.$silent = false;
        if (this.$cursorChanged)
            this._emit("changeCursor");
        if (this.$cursorChanged || this.$anchorChanged)
            this._emit("changeSelection");
    };

    $moveSelection(mover: (selection: this) => void) {
        var lead = this.lead;
        if (this.$isEmpty)
            this.setSelectionAnchor(lead.row, lead.column);

        mover.call(this);
    };

    /**
     * Moves the selection cursor to the indicated row and column.
     * @param {Number} row The row to select to
     * @param {Number} column The column to select to
     **/
    selectTo(row: number, column: number) {
        this.$moveSelection(function(this: Selection) {
            this.moveCursorTo(row, column);
        });
    };

    /**
     * Moves the selection cursor to the row and column indicated by `pos`.
     * @param {Object} pos An object containing the row and column
     **/
    selectToPosition(pos: Position) {
        this.$moveSelection(function(this: Selection) {
            this.moveCursorToPosition(pos);
        });
    };

    /**
     * Moves the selection cursor to the indicated row and column.
     * @param {Number} row The row to select to
     * @param {Number} column The column to select to
     *
     **/
    moveTo(row: number, column: number) {
        this.clearSelection();
        this.moveCursorTo(row, column);
    };

    /**
     * Moves the selection cursor to the row and column indicated by `pos`.
     * @param {Object} pos An object containing the row and column
     **/
    moveToPosition(pos: Position) {
        this.clearSelection();
        this.moveCursorToPosition(pos);
    };


    /**
     * Moves the selection up one row.
     **/
    selectUp() {
        this.$moveSelection(this.moveCursorUp);
    };

    /**
     * Moves the selection down one row.
     **/
    selectDown() {
        this.$moveSelection(this.moveCursorDown);
    };

    /**
     * Moves the selection right one column.
     **/
    selectRight() {
        this.$moveSelection(this.moveCursorRight);
    };

    /**
     * Moves the selection left one column.
     **/
    selectLeft() {
        this.$moveSelection(this.moveCursorLeft);
    };

    /**
     * Moves the selection to the beginning of the current line.
     **/
    selectLineStart() {
        this.$moveSelection(this.moveCursorLineStart);
    };

    /**
     * Moves the selection to the end of the current line.
     **/
    selectLineEnd() {
        this.$moveSelection(this.moveCursorLineEnd);
    };

    /**
     * Moves the selection to the end of the file.
     **/
    selectFileEnd() {
        this.$moveSelection(this.moveCursorFileEnd);
    };

    /**
     * Moves the selection to the start of the file.
     **/
    selectFileStart() {
        this.$moveSelection(this.moveCursorFileStart);
    };

    /**
     * Moves the selection to the first word on the right.
     **/
    selectWordRight() {
        this.$moveSelection(this.moveCursorWordRight);
    };

    /**
     * Moves the selection to the first word on the left.
     **/
    selectWordLeft() {
        this.$moveSelection(this.moveCursorWordLeft);
    };

    /**
     * Moves the selection to highlight the entire word.
     * @related EditSession.getWordRange
     **/
    getWordRange(): Range;
    getWordRange(position: Position): Range;
    getWordRange(row: number, column: number): Range;
    getWordRange(rowOrPosition?: number|Position, column?: number) {
        var row;
        if (typeof column == "undefined") {
            var cursor = <Position>(rowOrPosition || this.lead);
            row = cursor.row;
            column = cursor.column;
        } else {
            row = <number>rowOrPosition;
        }
        return this.session.getWordRange(row, column);
    };

    /**
     * Selects an entire word boundary.
     **/
    selectWord() {
        this.setSelectionRange(this.getWordRange());
    };

    /**
     * Selects a word, including its right whitespace.
     * @related EditSession.getAWordRange
     **/
    selectAWord() {
        var cursor = this.getCursor();
        var range = this.session.getAWordRange(cursor.row, cursor.column);
        this.setSelectionRange(range);
    };

    getLineRange(row?: number, excludeLastChar?: boolean) {
        var rowStart = typeof row == "number" ? row : this.lead.row;
        var rowEnd;

        var foldLine = this.session.getFoldLine(rowStart);
        if (foldLine) {
            rowStart = foldLine.start.row;
            rowEnd = foldLine.end.row;
        } else {
            rowEnd = rowStart;
        }
        if (excludeLastChar === true)
            return new Range(rowStart, 0, rowEnd, this.session.getLine(rowEnd).length);
        else
            return new Range(rowStart, 0, rowEnd + 1, 0);
    };

    /**
     * Selects the entire line.
     **/
    selectLine() {
        this.setSelectionRange(this.getLineRange());
    };

    /**
     * Moves the cursor up one row.
     **/
    moveCursorUp() {
        this.moveCursorBy(-1, 0);
    };

    /**
     * Moves the cursor down one row.
     **/
    moveCursorDown() {
        this.moveCursorBy(1, 0);
    };

    /**
     *
     * Returns `true` if moving the character next to the cursor in the specified direction is a soft tab.
     * @param {Object} cursor the current cursor position
     * @param {Number} tabSize the tab size
     * @param {Number} direction 1 for right, -1 for left
     */
    wouldMoveIntoSoftTab(cursor: Position, tabSize: number, direction: MoveDirection) {
        var start = cursor.column;
        var end = cursor.column + tabSize;

        if (direction < 0) {
            start = cursor.column - tabSize;
            end = cursor.column;
        }
        return this.session.isTabStop(cursor) && this.doc.getLine(cursor.row).slice(start, end).split(" ").length-1 == tabSize;
    };

    /**
     * Moves the cursor left one column.
     **/
    moveCursorLeft() {
        var cursor = this.lead.getPosition(),
            fold;

        if (fold = this.session.getFoldAt(cursor.row, cursor.column, -1)) {
            this.moveCursorTo(fold.start.row, fold.start.column);
        } else if (cursor.column === 0) {
            // cursor is a line (start
            if (cursor.row > 0) {
                this.moveCursorTo(cursor.row - 1, this.doc.getLine(cursor.row - 1).length);
            }
        }
        else {
            var tabSize = this.session.getTabSize();
            if (this.wouldMoveIntoSoftTab(cursor, tabSize, -1) && !this.session.getNavigateWithinSoftTabs()) {
                this.moveCursorBy(0, -tabSize);
            } else {
                this.moveCursorBy(0, -1);
            }
        }
    };

    /**
     * Moves the cursor right one column.
     **/
    moveCursorRight() {
        var cursor = this.lead.getPosition();
        var fold;
        if (fold = this.session.getFoldAt(cursor.row, cursor.column, 1)) {
            this.moveCursorTo(fold.end.row, fold.end.column);
        }
        else if (this.lead.column == this.doc.getLine(this.lead.row).length) {
            if (this.lead.row < this.doc.getLength() - 1) {
                this.moveCursorTo(this.lead.row + 1, 0);
            }
        }
        else {
            var tabSize = this.session.getTabSize();
            var cursor = <Position>this.lead;
            if (this.wouldMoveIntoSoftTab(cursor, tabSize, 1) && !this.session.getNavigateWithinSoftTabs()) {
                this.moveCursorBy(0, tabSize);
            } else {
                this.moveCursorBy(0, 1);
            }
        }
    };

    /**
     * Moves the cursor to the start of the line.
     **/
    moveCursorLineStart() {
        var row = this.lead.row;
        var column = this.lead.column;
        var screenRow = this.session.documentToScreenRow(row, column);

        // Determ the doc-position of the first character at the screen line.
        var firstColumnPosition = this.session.screenToDocumentPosition(screenRow, 0);

        // Determ the line
        var beforeCursor = this.session.getDisplayLine(
            row, null, firstColumnPosition.row,
            firstColumnPosition.column
        );

        var leadingSpace = beforeCursor.match(/^\s*/);
        // TODO find better way for emacs mode to override selection behaviors
        if (leadingSpace[0].length != column && !this.session.$useEmacsStyleLineStart)
            firstColumnPosition.column += leadingSpace[0].length;
        this.moveCursorToPosition(firstColumnPosition);
    };

    /**
     * Moves the cursor to the end of the line.
     **/
    moveCursorLineEnd() {
        var lead = this.lead;
        var lineEnd = this.session.getDocumentLastRowColumnPosition(lead.row, lead.column);
        if (this.lead.column == lineEnd.column) {
            var line = this.session.getLine(lineEnd.row);
            if (lineEnd.column == line.length) {
                var textEnd = line.search(/\s+$/);
                if (textEnd > 0)
                    lineEnd.column = textEnd;
            }
        }

        this.moveCursorTo(lineEnd.row, lineEnd.column);
    };

    /**
     * Moves the cursor to the end of the file.
     **/
    moveCursorFileEnd() {
        var row = this.doc.getLength() - 1;
        var column = this.doc.getLine(row).length;
        this.moveCursorTo(row, column);
    };

    /**
     * Moves the cursor to the start of the file.
     **/
    moveCursorFileStart() {
        this.moveCursorTo(0, 0);
    };

    /**
     * Moves the cursor to the word on the right.
     **/
    moveCursorLongWordRight() {
        var row = this.lead.row;
        var column = this.lead.column;
        var line = this.doc.getLine(row);
        var rightOfCursor = line.substring(column);

        this.session.nonTokenRe.lastIndex = 0;
        this.session.tokenRe.lastIndex = 0;

        // skip folds
        var fold = this.session.getFoldAt(row, column, 1);
        if (fold) {
            this.moveCursorTo(fold.end.row, fold.end.column);
            return;
        }

        // first skip space
        if (this.session.nonTokenRe.exec(rightOfCursor)) {
            column += this.session.nonTokenRe.lastIndex;
            this.session.nonTokenRe.lastIndex = 0;
            rightOfCursor = line.substring(column);
        }

        // if at line end proceed with next line
        if (column >= line.length) {
            this.moveCursorTo(row, line.length);
            this.moveCursorRight();
            if (row < this.doc.getLength() - 1)
                this.moveCursorWordRight();
            return;
        }

        // advance to the end of the next token
        if (this.session.tokenRe.exec(rightOfCursor)) {
            column += this.session.tokenRe.lastIndex;
            this.session.tokenRe.lastIndex = 0;
        }

        this.moveCursorTo(row, column);
    };

    /**
    *
    * Moves the cursor to the word on the left.
    **/
    moveCursorLongWordLeft() {
        var row = this.lead.row;
        var column = this.lead.column;

        // skip folds
        var fold;
        if (fold = this.session.getFoldAt(row, column, -1)) {
            this.moveCursorTo(fold.start.row, fold.start.column);
            return;
        }

        var str = this.session.getFoldStringAt(row, column, -1);
        if (str == null) {
            str = this.doc.getLine(row).substring(0, column);
        }

        var leftOfCursor = lang.stringReverse(str);
        this.session.nonTokenRe.lastIndex = 0;
        this.session.tokenRe.lastIndex = 0;

        // skip whitespace
        if (this.session.nonTokenRe.exec(leftOfCursor)) {
            column -= this.session.nonTokenRe.lastIndex;
            leftOfCursor = leftOfCursor.slice(this.session.nonTokenRe.lastIndex);
            this.session.nonTokenRe.lastIndex = 0;
        }

        // if at begin of the line proceed in line above
        if (column <= 0) {
            this.moveCursorTo(row, 0);
            this.moveCursorLeft();
            if (row > 0)
                this.moveCursorWordLeft();
            return;
        }

        // move to the begin of the word
        if (this.session.tokenRe.exec(leftOfCursor)) {
            column -= this.session.tokenRe.lastIndex;
            this.session.tokenRe.lastIndex = 0;
        }

        this.moveCursorTo(row, column);
    };

    $shortWordEndIndex(rightOfCursor: string) {
        var index = 0, ch;
        var whitespaceRe = /\s/;
        var tokenRe = this.session.tokenRe;

        tokenRe.lastIndex = 0;
        if (this.session.tokenRe.exec(rightOfCursor)) {
            index = this.session.tokenRe.lastIndex;
        } else {
            while ((ch = rightOfCursor[index]) && whitespaceRe.test(ch))
                index ++;

            if (index < 1) {
                tokenRe.lastIndex = 0;
                 while ((ch = rightOfCursor[index]) && !tokenRe.test(ch)) {
                    tokenRe.lastIndex = 0;
                    index ++;
                    if (whitespaceRe.test(ch)) {
                        if (index > 2) {
                            index--;
                            break;
                        } else {
                            while ((ch = rightOfCursor[index]) && whitespaceRe.test(ch))
                                index ++;
                            if (index > 2)
                                break;
                        }
                    }
                }
            }
        }
        tokenRe.lastIndex = 0;

        return index;
    };

    moveCursorShortWordRight() {
        var row = this.lead.row;
        var column = this.lead.column;
        var line = this.doc.getLine(row);
        var rightOfCursor = line.substring(column);

        var fold = this.session.getFoldAt(row, column, 1);
        if (fold)
            return this.moveCursorTo(fold.end.row, fold.end.column);

        if (column == line.length) {
            var l = this.doc.getLength();
            do {
                row++;
                rightOfCursor = this.doc.getLine(row);
            } while (row < l && /^\s*$/.test(rightOfCursor));

            if (!/^\s+/.test(rightOfCursor))
                rightOfCursor = "";
            column = 0;
        }

        var index = this.$shortWordEndIndex(rightOfCursor);

        this.moveCursorTo(row, column + index);
    };

    moveCursorShortWordLeft() {
        var row = this.lead.row;
        var column = this.lead.column;

        var fold;
        if (fold = this.session.getFoldAt(row, column, -1))
            return this.moveCursorTo(fold.start.row, fold.start.column);

        var line = this.session.getLine(row).substring(0, column);
        if (column === 0) {
            do {
                row--;
                line = this.doc.getLine(row);
            } while (row > 0 && /^\s*$/.test(line));

            column = line.length;
            if (!/\s+$/.test(line))
                line = "";
        }

        var leftOfCursor = lang.stringReverse(line);
        var index = this.$shortWordEndIndex(leftOfCursor);

        return this.moveCursorTo(row, column - index);
    };

    moveCursorWordRight() {
        if (this.session.$selectLongWords)
            this.moveCursorLongWordRight();
        else
            this.moveCursorShortWordRight();
    };

    moveCursorWordLeft() {
        if (this.session.$selectLongWords)
            this.moveCursorLongWordLeft();
        else
            this.moveCursorShortWordLeft();
    };

    /**
     * Moves the cursor to position indicated by the parameters. Negative numbers move the cursor backwards in the document.
     * @param {Number} rows The number of rows to move by
     * @param {Number} chars The number of characters to move by
     *
     * @related EditSession.documentToScreenPosition
     **/
    moveCursorBy(rows: number, chars: number) {
        var screenPos = this.session.documentToScreenPosition(
            this.lead.row,
            this.lead.column
        );

        var offsetX;

        if (chars === 0) {
            if (rows !== 0) {
                if (this.session.$bidiHandler.isBidiRow(screenPos.row, this.lead.row)) {
                    offsetX = this.session.$bidiHandler.getPosLeft(screenPos.column);
                    screenPos.column = Math.round(offsetX / this.session.$bidiHandler.charWidths[0]);
                } else {
                    offsetX = screenPos.column * this.session.$bidiHandler.charWidths[0];
                }
            }

            if (this.$desiredColumn)
                screenPos.column = this.$desiredColumn;
            else
                this.$desiredColumn = screenPos.column;
        }

        var docPos = this.session.screenToDocumentPosition(screenPos.row + rows, screenPos.column, offsetX);
        
        if (rows !== 0 && chars === 0 && docPos.row === this.lead.row && docPos.column === this.lead.column) {
            if (this.session.lineWidgets && this.session.lineWidgets[docPos.row]) {
                if (docPos.row > 0 || rows > 0)
                    docPos.row++;
            }
        }

        // move the cursor and update the desired column
        this.moveCursorTo(docPos.row, docPos.column + chars, chars === 0);
    };

    /**
     * Moves the selection to the position indicated by its `row` and `column`.
     * @param {Object} position The position to move to
     **/
    moveCursorToPosition(position: Position) {
        this.moveCursorTo(position.row, position.column);
    };

    /**
     * Moves the cursor to the row and column provided. [If `preventUpdateDesiredColumn` is `true`, then the cursor stays in the same column position as its original point.]{: #preventUpdateBoolDesc}
     * @param {Number} row The row to move to
     * @param {Number} column The column to move to
     * @param {Boolean} keepDesiredColumn [If `true`, the cursor move does not respect the previous column]{: #preventUpdateBool}
     *
     **/
    moveCursorTo(row: number, column: number, keepDesiredColumn=false) {
        // Ensure the row/column is not inside of a fold.
        var fold = this.session.getFoldAt(row, column, 1);
        if (fold) {
            row = fold.start.row;
            column = fold.start.column;
        }

        this.$keepDesiredColumnOnChange = true;
        var line = this.session.getLine(row);
        // do not allow putting cursor in the middle of surrogate pairs
        if (/[\uDC00-\uDFFF]/.test(line.charAt(column)) && line.charAt(column - 1)) {
            if (this.lead.row == row && this.lead.column == column + 1)
                column = column - 1;
            else
                column = column + 1;
        }
        this.lead.setPosition(row, column);
        this.$keepDesiredColumnOnChange = false;

        if (!keepDesiredColumn)
            this.$desiredColumn = null;
    };

    /**
     * Moves the cursor to the screen position indicated by row and column. {:preventUpdateBoolDesc}
     * @param {Number} row The row to move to
     * @param {Number} column The column to move to
     * @param {Boolean} keepDesiredColumn {:preventUpdateBool}
     *
     **/
    moveCursorToScreen(row: number, column: number, keepDesiredColumn?: boolean) {
        var pos = this.session.screenToDocumentPosition(row, column);
        this.moveCursorTo(pos.row, pos.column, keepDesiredColumn);
    };

    // remove listeners from document
    detach() {
        this.lead.detach();
        this.anchor.detach();
        this.session = this.doc = null;
    };

    fromOrientedRange(range: OrientRange) {
        this.setSelectionRange(range, range.cursor == range.start);
        this.$desiredColumn = range.desiredColumn || this.$desiredColumn;
    };

    toOrientedRange(range?: OrientRange) {
        var r = this.getRange();
        if (range) {
            range.start.column = r.start.column;
            range.start.row = r.start.row;
            range.end.column = r.end.column;
            range.end.row = r.end.row;
        } else {
            range = r;
        }

        range.cursor = this.isBackwards() ? range.start : range.end;
        range.desiredColumn = this.$desiredColumn;
        return range;
    };

    /**
     * Saves the current cursor position and calls `func` that can change the cursor
     * postion. The result is the range of the starting and eventual cursor position.
     * Will reset the cursor position.
     * @param {Function} The callback that should change the cursor position
     * @returns {Range}
     *
     **/
    getRangeOfMovements(func: (selection: this) => void) {
        var start = this.getCursor();
        try {
            func(this);
            var end = this.getCursor();
            return Range.fromPoints(start, end);
        } catch(e) {
            return Range.fromPoints(start, start);
        } finally {
            this.moveCursorToPosition(start);
        }
    };

    toJSON() {
        let data: any;
        if (this.rangeCount) {
            data = this.ranges.map(function(r) {
                var r1 = <OrientRange>r.clone();
                r1.isBackwards = r.cursor == r.start;
                return r1;
            });
        } else {
            data = this.getRange();
            data.isBackwards = this.isBackwards();
        }
        return data;
    };

    fromJSON(data: any) {
        if (data.start == undefined) {
            if (this.rangeList) {
                this.toSingleRange(data[0]);
                for (var i = data.length; i--; ) {
                    var r = <OrientRange>Range.fromPoints(data[i].start, data[i].end);
                    if (data[i].isBackwards)
                        r.cursor = r.start;
                    this.addRange(r, true);
                }
                return;
            } else {
                data = data[0];
            }
        }
        if (this.rangeList)
            this.toSingleRange(data);
        this.setSelectionRange(data, data.isBackwards);
    };

    isEqual(data: any) {
        if ((data.length || this.rangeCount) && data.length != this.rangeCount)
            return false;
        if (!data.length || !this.ranges)
            return this.getRange().isEqual(data);

        for (var i = this.ranges.length; i--; ) {
            if (!this.ranges[i].isEqual(data[i]))
                return false;
        }
        return true;
    };

    // mutli select
    toSingleRange: (range: OrientRange) => void;
    addRange: (range: OrientRange, $blockChangeEvents?: boolean) => void;
    getAllRanges: () => OrientRange[];
};

Selection.prototype.getAnchor = Selection.prototype.getSelectionAnchor;
Selection.prototype.setRange = Selection.prototype.setSelectionRange