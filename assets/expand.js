const state = {
  __folded: true,
  get folded() {
    try {
      const v = localStorage.getItem("folded");
      return v === "true" || v === null;
    } catch {
      return this.__folded;
    }
  },
  set folded(val) {
    this.__folded = val;
    try {
      localStorage.setItem("folded", val);
    } catch {}
    document.body.classList.toggle("folded", val);
  },
};
state.folded = state.folded;

const button = document.querySelector("#expand");
button.addEventListener("click", () => {
  state.folded = !state.folded;
  if (state.folded) {
    const old = scrollY;
    location.hash = "";
    scrollTo(0, old);
  }
});

function onHashChange(event) {
  const target = document.getElementById(location.hash.slice(1));
  if (!target) return;
  if (!state.folded) return;
  for (const el of document.querySelectorAll(".fold")) {
    if (el.contains(target)) {
      state.folded = false;
      target.scrollIntoView(true);
      setExpand(false);
    }
  }
}
window.addEventListener("hashchange", onHashChange);
window.addEventListener("DOMContentLoaded", onHashChange);
