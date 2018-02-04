class AODHFront {

    constructor() {

        this.point = null;
        this.notes = null;
        this.sentence = null;
        this.audio = {};
        this.activateKey = 16; // shift 16, ctl 17, alt 18
        this.enabled = true;
        this.popup = new Popup();
        this.timeout = null;

        window.addEventListener('mousemove', e => this.onMouseMove(e));
        window.addEventListener('mousedown', e => this.onMouseDown(e));
        window.addEventListener('keydown', e => this.onKeyDown(e));

        chrome.runtime.onMessage.addListener(this.onBgMessage.bind(this));
        window.addEventListener('message', e => this.onFrameMessage(e));
        document.addEventListener('selectionchange', e => this.userSelectionChanged(e));
        window.addEventListener('selectionend', e => this.onSelectionEnd(e));
    }

    onKeyDown(e) {
        if (this.enabled && this.point !== null && (e.keyCode === this.activateKey || e.charCode === this.activateKey)) {
            const range = document.caretRangeFromPoint(this.point.x, this.point.y);
            if (range !== null) {
                let textSource = new TextSourceRange(range);
                textSource.selectText();
            }
        }
    }

    onMouseDown(e) {
        this.popup.hide();
    }

    onMouseMove(e) {
        this.point = {
            x: e.clientX,
            y: e.clientY,
        };
    }

    userSelectionChanged(e) {

        if (!this.enabled)
            return;

        // wait 500 ms after the last selection change event
        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        this.timeout = setTimeout(() => {
            var selEndEvent = new CustomEvent("selectionend");
            window.dispatchEvent(selEndEvent);
        }, 500);
    }

    onSelectionEnd(e) {

        if (!this.enabled)
            return;

        // reset selection timeout
        this.timeout = null;

        const expression = selectedText();
        if (isInvalid(expression)) {
            return;
        };

        let request = {
            action: 'getTranslation',
            params: {
                expression
            },
        };
        chrome.runtime.sendMessage(request, result => {
            if (result == null || result.length == 0)
                return;

            this.notes = this.buildNote(result);

            let content = this.renderPopup(this.notes);
            this.popup.showNextTo({
                x: this.point.x,
                y: this.point.y,
            }, content);
        });

    }

    onBgMessage({
        action,
        params
    }, sender, callback) {
        const method = this['api_' + action];
        if (typeof (method) === 'function') {
            params.callback = callback;
            method.call(this, params);
        }

        callback();
    }

    api_setOptions(params) {
        let {
            options,
            callback
        } = params;

        this.enabled = options.enabled;
        callback();
    }

    onFrameMessage(e) {
        const {
            action,
            params
        } = e.data, method = this['api_' + action];
        if (typeof (method) === 'function') {
            method.call(this, params);
        }
    }

    api_createNote(params) {
        let {
            nindex,
            dindex
        } = params;

        let note = Object.assign({}, this.notes[nindex]);
        note.definition = this.notes[nindex].css + this.notes[nindex].definitions[dindex];
        let request = {
            action: 'createNote',
            params: {
                note
            },
        };
        chrome.runtime.sendMessage(request, () => {});
    }

    api_playAudio(params) {
        let {
            nindex,
            dindex
        } = params;
        let url = this.notes[nindex].audios[dindex];

        for (let key in this.audio) {
            this.audio[key].pause();
        }

        const audio = this.audio[url] || new Audio(url);
        audio.currentTime = 0;
        audio.play();

        this.audio[url] = audio;
    }

    buildNote(result) {
        //get 1 sentence around the expression.
        const expression = selectedText();
        const sentence = getSentence(1);
        this.sentence = sentence;
        let tmpl = {
            css: '',
            expression,
            reading: '',
            definitions:["script didn't generate definition, please double check!"],
            sentence,
        };

        //if 'result' is array with notes.
        if (Array.isArray(result)) {
            for (const item of result) {
                for (const key in tmpl) {
                    if (!item.hasOwnProperty(key)) {
                        item[key] = tmpl[key];
                    }
                }
            }
            return result;
        } else { // if 'result' is simple string, then return standard template.
            tmpl['definitions'] = [].concat(result);
            return [tmpl];
        }

    }

    renderPopup(notes) {
        let plusimg = chrome.extension.getURL('fg/img/plus.png');
        let playimg = chrome.extension.getURL('fg/img/play.png');

        let content = '';
        for (const [nindex, note] of notes.entries()) {
            content += note.css +`<div class="odh-note">`;
            let audiosegment = '';
            if (note.audios) {
                for (const [dindex, audio] of note.audios.entries()) {
                    audiosegment += `<img class="odh-playaudio" data-nindex="${nindex}" data-dindex="${dindex}" src="${playimg}"/>`;
                }
            }
            content += `<div class="odh-headsection">${audiosegment}<span class="odh-expression">${note.expression}</span><span class="odh-reading">${note.reading}</span></div>`;
            for (const [dindex, definition] of note.definitions.entries()) {
                content += `<div class="odh-definition"><img class="odh-createnote" data-nindex="${nindex}" data-dindex="${dindex}" src="${plusimg}"/>${definition}</div>`;
            }
            content += `</div>`;
        }
        content += `<div class="odh-sentence">${this.sentence}</div>`;
        return this.popupHeader() + content + this.popupFooter();
    }

    popupHeader() {
        let css = chrome.extension.getURL('fg/css/frame.css');
        return `
        <html lang="en">
            <head><meta charset="UTF-8"><title></title>
                <link rel="stylesheet" href="${css}">
            </head>
            <body style="margin:0px;">
            <div class="odh-notes">`;
    }

    popupFooter() {
        let js = chrome.extension.getURL('fg/js/frame.js');
        return `
            </div>
            <script src="${js}"></script>
            </body>
        </html>`;
    }
}

window.aodhfront = new AODHFront();