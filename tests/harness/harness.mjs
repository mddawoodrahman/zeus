// Bundled into the test page only. Expose the host model so the browser test
// can distinguish an accepted editor transaction from a superficial DOM edit.
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from 'prosemirror-schema-basic';
import Quill from 'quill/core';
const form = document.querySelector('form');
let model = '';
window.submissions = 0;
window.transactions = [];
form.addEventListener('submit', (e) => {
  e.preventDefault();
  window.submissions++;
});
const file = document.createElement('input');
file.type = 'file';
file.hidden = true;
form.append(file);
form.querySelector('[aria-label="Attach file"]').onclick = () => file.click();
file.onchange = () => {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.textContent = 'File';
  chip.setAttribute('aria-label', 'Remove attachment');
  chip.onclick = () => {
    file.value = '';
    chip.remove();
  };
  form.querySelector('[role=toolbar]').prepend(chip);
};
const pm = form.querySelector('.ProseMirror');
const quill = form.querySelector('#quill');
if (pm) {
  const view = new EditorView(
    { mount: pm },
    {
      state: EditorState.create({ schema }),
      dispatchTransaction(tr) {
        this.updateState(this.state.apply(tr));
        model = this.state.doc.textBetween(0, this.state.doc.content.size, '\n');
        window.transactions.push({ model, from: tr.selection.from, to: tr.selection.to });
      }
    }
  );
  view.dom.setAttribute('aria-label', 'Chat message');
} else if (quill) {
  const view = new Quill(quill);
  view.on('text-change', () => {
    model = view.getText().slice(0, -1);
  });
} else {
  form.addEventListener('input', (e) => {
    if (e.target !== file) model = e.target.value ?? e.target.innerText;
  });
}
window.readHostModel = () => model;
window.initialGeometry = {
  width: form.offsetWidth,
  height: form.offsetHeight,
  scroll: document.documentElement.scrollWidth
};
