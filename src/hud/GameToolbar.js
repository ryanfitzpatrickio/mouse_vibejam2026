const BUTTON_SIZE = 38;
const BUTTON_COUNT = 4;
const BUTTON_GAP = 0;
const SVG_NS = 'http://www.w3.org/2000/svg';

function stopUiEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function stopPanelEvent(event) {
  event.stopPropagation();
}

function styleButton(button) {
  Object.assign(button.style, {
    width: `${BUTTON_SIZE}px`,
    height: `${BUTTON_SIZE}px`,
    borderRadius: '0',
    border: '0',
    borderRight: '1px solid rgba(255,255,255,0.16)',
    background: 'transparent',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    touchAction: 'manipulation',
    userSelect: 'none',
    flexShrink: '0',
  });
}

function setPressedStyle(button, pressed) {
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  button.style.background = pressed ? 'rgba(188,48,42,0.82)' : 'transparent';
  button.style.color = pressed ? '#fff2de' : '#fff';
}

function addSvgLine(svg, attrs) {
  const line = document.createElementNS(SVG_NS, 'line');
  for (const [key, value] of Object.entries(attrs)) line.setAttribute(key, value);
  svg.appendChild(line);
}

function addSvgPath(svg, attrs) {
  const path = document.createElementNS(SVG_NS, 'path');
  for (const [key, value] of Object.entries(attrs)) path.setAttribute(key, value);
  svg.appendChild(path);
}

function addSvgCircle(svg, attrs) {
  const circle = document.createElementNS(SVG_NS, 'circle');
  for (const [key, value] of Object.entries(attrs)) circle.setAttribute(key, value);
  svg.appendChild(circle);
}

function createIconSvg(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '21');
  svg.setAttribute('height', '21');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.pointerEvents = 'none';

  if (name === 'github') {
    svg.setAttribute('fill', 'currentColor');
    addSvgPath(svg, {
      d: 'M12 2.5a9.5 9.5 0 0 0-3 18.52c.48.08.66-.2.66-.46v-1.6c-2.68.58-3.24-1.14-3.24-1.14-.44-1.1-1.08-1.4-1.08-1.4-.88-.6.06-.58.06-.58.98.06 1.5 1 1.5 1 .86 1.48 2.28 1.06 2.82.8.1-.62.34-1.06.62-1.3-2.14-.24-4.4-1.06-4.4-4.76 0-1.06.38-1.92 1-2.6-.1-.24-.44-1.22.1-2.56 0 0 .82-.26 2.68 1a9.2 9.2 0 0 1 4.88 0c1.86-1.26 2.68-1 2.68-1 .54 1.34.2 2.32.1 2.56.62.68 1 1.54 1 2.6 0 3.7-2.26 4.52-4.42 4.76.36.3.68.9.68 1.82v2.7c0 .26.18.54.68.46A9.5 9.5 0 0 0 12 2.5z',
    });
    return svg;
  }

  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  if (name === 'music' || name === 'musicOff') {
    addSvgPath(svg, { d: 'M9 18.2a2.2 2.2 0 1 1-1.2-2v-10l9-1.8v10.2' });
    addSvgPath(svg, { d: 'M16.8 14.6a2.2 2.2 0 1 1-1.2-2' });
    addSvgLine(svg, { x1: '7.8', y1: '9', x2: '16.8', y2: '7.2' });
  } else if (name === 'sfx' || name === 'sfxOff') {
    addSvgPath(svg, { d: 'M4 9.3h3.2l4.2-3.5v12.4l-4.2-3.5H4z' });
    addSvgPath(svg, { d: 'M15 9.2a4.2 4.2 0 0 1 0 5.6' });
    addSvgPath(svg, { d: 'M17.8 6.7a8 8 0 0 1 0 10.6' });
  } else if (name === 'gear') {
    addSvgCircle(svg, { cx: '12', cy: '12', r: '3.1' });
    addSvgPath(svg, { d: 'M19.1 13.4a7.8 7.8 0 0 0 0-2.8l2-1.5-2-3.4-2.4 1a7.4 7.4 0 0 0-2.4-1.4L14 2.7h-4l-.4 2.6a7.4 7.4 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 2.8l-2 1.5 2 3.4 2.4-1a7.4 7.4 0 0 0 2.4 1.4l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2.4-1.4l2.4 1 2-3.4z' });
  } else if (name === 'close') {
    addSvgLine(svg, { x1: '7', y1: '7', x2: '17', y2: '17' });
    addSvgLine(svg, { x1: '17', y1: '7', x2: '7', y2: '17' });
  }

  if (name === 'musicOff' || name === 'sfxOff') {
    addSvgLine(svg, { x1: '4.5', y1: '4.5', x2: '19.5', y2: '19.5' });
  }

  return svg;
}

function setButtonIcon(button, iconName) {
  button.replaceChildren(createIconSvg(iconName));
}

function createToolbarButton(iconName, title, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = title;
  button.ariaLabel = title;
  styleButton(button);
  setButtonIcon(button, iconName);
  button.addEventListener('pointerdown', stopUiEvent);
  button.addEventListener('click', (event) => {
    stopUiEvent(event);
    onClick?.();
  });
  return button;
}

export class GameToolbar {
  constructor({
    container = document.body,
    githubUrl,
    onToggleMusic,
    onToggleSfx,
    onOpenGithub,
    onChangeDisplayName,
    displayName = 'Mouse',
  } = {}) {
    this.container = container;
    this.githubUrl = githubUrl;
    this.onToggleMusic = onToggleMusic;
    this.onToggleSfx = onToggleSfx;
    this.onOpenGithub = onOpenGithub;
    this.onChangeDisplayName = onChangeDisplayName;
    this.displayName = displayName;
    this.musicMuted = false;
    this.sfxMuted = false;
    this._createElements();
  }

  _createElements() {
    this.element = document.createElement('div');
    this.element.id = 'game-toolbar';
    Object.assign(this.element.style, {
      position: 'fixed',
      top: 'env(safe-area-inset-top, 0px)',
      left: 'env(safe-area-inset-left, 0px)',
      zIndex: '12000',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: `${BUTTON_GAP}px`,
      width: `${BUTTON_SIZE * BUTTON_COUNT}px`,
      maxWidth: 'calc(100vw - env(safe-area-inset-left, 0px))',
      overflow: 'hidden',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.28)',
      background: 'rgba(18,18,18,0.8)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      pointerEvents: 'auto',
      userSelect: 'none',
    });
    this.element.addEventListener('pointerdown', stopUiEvent);

    this.musicButton = createToolbarButton('music', 'Mute music', () => {
      this.onToggleMusic?.();
    });
    this.sfxButton = createToolbarButton('sfx', 'Mute sound effects', () => {
      this.onToggleSfx?.();
    });
    this.githubButton = createToolbarButton('github', 'Open GitHub', () => {
      if (this.onOpenGithub) {
        this.onOpenGithub();
      } else if (this.githubUrl) {
        window.open(this.githubUrl, '_blank', 'noopener,noreferrer');
      }
    });
    this.settingsButton = createToolbarButton('gear', 'Settings', () => {
      this.setSettingsOpen(!this.settingsOpen);
    });

    this.element.append(
      this.musicButton,
      this.sfxButton,
      this.githubButton,
      this.settingsButton,
    );
    this.settingsButton.style.borderRight = '0';

    this.panel = document.createElement('div');
    this.panel.id = 'settings-panel';
    Object.assign(this.panel.style, {
      position: 'fixed',
      top: `calc(env(safe-area-inset-top, 0px) + ${BUTTON_SIZE + 1}px)`,
      left: 'env(safe-area-inset-left, 0px)',
      width: 'min(280px, calc(100vw - env(safe-area-inset-left, 0px)))',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.24)',
      background: 'rgba(18,18,18,0.9)',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '12px',
      lineHeight: '1.4',
      padding: '12px',
      zIndex: '12000',
      boxShadow: '0 12px 28px rgba(0,0,0,0.38)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      pointerEvents: 'auto',
      display: 'none',
      userSelect: 'none',
    });
    this.panel.addEventListener('pointerdown', stopPanelEvent);
    this.panel.addEventListener('click', (event) => event.stopPropagation());

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      marginBottom: '10px',
    });

    const title = document.createElement('div');
    title.textContent = 'Settings';
    Object.assign(title.style, {
      fontSize: '13px',
      fontWeight: '700',
      color: '#fff6d7',
    });

    const closeButton = createToolbarButton('close', 'Close settings', () => {
      this.setSettingsOpen(false);
    });
    Object.assign(closeButton.style, {
      width: '28px',
      height: '28px',
      fontSize: '12px',
      flexShrink: '0',
    });

    header.append(title, closeButton);

    this.nameRow = this._createNameRow();
    this.musicRow = this._createSettingRow('Music', () => this.onToggleMusic?.());
    this.sfxRow = this._createSettingRow('Sound effects', () => this.onToggleSfx?.());

    const link = document.createElement('button');
    link.type = 'button';
    link.textContent = 'GitHub';
    Object.assign(link.style, {
      width: '100%',
      height: '34px',
      marginTop: '8px',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.22)',
      background: 'rgba(255,255,255,0.08)',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '12px',
      fontWeight: '700',
      cursor: 'pointer',
    });
    link.addEventListener('pointerdown', stopUiEvent);
    link.addEventListener('click', (event) => {
      stopUiEvent(event);
      this.githubButton.click();
    });

    const controls = document.createElement('div');
    controls.textContent = 'WASD to move. Space jumps. Shift sprints. F opens emotes.';
    Object.assign(controls.style, {
      marginTop: '10px',
      color: 'rgba(255,255,255,0.76)',
    });

    this.panel.append(header, this.nameRow.root, this.musicRow.root, this.sfxRow.root, link, controls);
    this.container.append(this.element, this.panel);
    this.updateState({});
  }

  _createNameRow() {
    const root = document.createElement('div');
    Object.assign(root.style, {
      width: '100%',
      marginBottom: '10px',
    });

    const label = document.createElement('label');
    label.textContent = 'Name';
    Object.assign(label.style, {
      display: 'block',
      marginBottom: '5px',
      color: '#fff6d7',
      fontWeight: '700',
    });

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 24;
    input.value = this.displayName;
    input.autocomplete = 'nickname';
    input.spellcheck = false;
    Object.assign(input.style, {
      flex: '1 1 auto',
      minWidth: '0',
      height: '34px',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.22)',
      background: 'rgba(0,0,0,0.32)',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '12px',
      padding: '0 9px',
      outline: 'none',
    });
    input.addEventListener('pointerdown', stopPanelEvent);
    input.addEventListener('click', stopPanelEvent);
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        this._commitDisplayName();
        input.blur();
      }
    });

    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save';
    Object.assign(save.style, {
      width: '58px',
      height: '34px',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.22)',
      background: 'rgba(255,255,255,0.08)',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '12px',
      fontWeight: '700',
      flexShrink: '0',
      cursor: 'pointer',
    });
    save.addEventListener('pointerdown', stopUiEvent);
    save.addEventListener('click', (event) => {
      stopUiEvent(event);
      this._commitDisplayName();
    });

    const status = document.createElement('div');
    status.textContent = '';
    Object.assign(status.style, {
      minHeight: '14px',
      marginTop: '4px',
      color: 'rgba(255,255,255,0.66)',
      fontSize: '10px',
    });

    row.append(input, save);
    root.append(label, row, status);
    return { root, input, status };
  }

  _commitDisplayName() {
    const applied = this.onChangeDisplayName?.(this.nameRow.input.value) ?? this.nameRow.input.value;
    this.setDisplayName(applied);
    this.nameRow.status.textContent = 'Saved';
    window.setTimeout(() => {
      if (this.nameRow?.status) this.nameRow.status.textContent = '';
    }, 1200);
  }

  _createSettingRow(label, onClick) {
    const root = document.createElement('button');
    root.type = 'button';
    Object.assign(root.style, {
      width: '100%',
      minHeight: '34px',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.16)',
      background: 'rgba(255,255,255,0.06)',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '0 10px',
      marginBottom: '8px',
      cursor: 'pointer',
    });
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('span');
    Object.assign(value.style, {
      fontWeight: '700',
      color: '#fff6d7',
      flexShrink: '0',
    });
    root.append(name, value);
    root.addEventListener('pointerdown', stopUiEvent);
    root.addEventListener('click', (event) => {
      stopUiEvent(event);
      onClick?.();
    });
    return { root, value };
  }

  updateState({
    musicMuted = this.musicMuted,
    sfxMuted = this.sfxMuted,
    displayName = this.displayName,
  } = {}) {
    this.musicMuted = !!musicMuted;
    this.sfxMuted = !!sfxMuted;
    this.setDisplayName(displayName);
    this.musicButton.title = this.musicMuted ? 'Unmute music' : 'Mute music';
    this.musicButton.ariaLabel = this.musicButton.title;
    this.sfxButton.title = this.sfxMuted ? 'Unmute sound effects' : 'Mute sound effects';
    this.sfxButton.ariaLabel = this.sfxButton.title;
    setButtonIcon(this.musicButton, this.musicMuted ? 'musicOff' : 'music');
    setButtonIcon(this.sfxButton, this.sfxMuted ? 'sfxOff' : 'sfx');
    setPressedStyle(this.musicButton, this.musicMuted);
    setPressedStyle(this.sfxButton, this.sfxMuted);
    this.musicRow.value.textContent = this.musicMuted ? 'Off' : 'On';
    this.sfxRow.value.textContent = this.sfxMuted ? 'Off' : 'On';
  }

  setDisplayName(displayName) {
    this.displayName = String(displayName || 'Mouse');
    if (this.nameRow?.input && document.activeElement !== this.nameRow.input) {
      this.nameRow.input.value = this.displayName;
    }
  }

  setSettingsOpen(open) {
    this.settingsOpen = !!open;
    this.panel.style.display = this.settingsOpen ? 'block' : 'none';
    setPressedStyle(this.settingsButton, this.settingsOpen);
  }

  dispose() {
    this.element.remove();
    this.panel.remove();
  }
}
