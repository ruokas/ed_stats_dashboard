export function setSectionTitle(heading, text) {
  if (!heading) {
    return;
  }
  const textNode = heading.querySelector('.section-title__text');
  if (textNode) {
    textNode.textContent = text;
  } else {
    heading.textContent = text;
  }
}
