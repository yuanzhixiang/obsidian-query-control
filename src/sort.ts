import {SortOption} from "./obsidian";
import { App } from "obsidian";

let tooltip: HTMLDivElement | undefined;
let removeEventListeners: () => void | undefined;
export function createSortPopup(options: SortOption[], buttonElement: HTMLElement,
                                setSortOrderCallback: (selectedOption: string) => void,
                                currentSortOrder: string, app: App) {
    if (tooltip) {
        removeEventListeners();
        return;
    }
    const doc = buttonElement.ownerDocument || activeDocument;
    const win = doc.defaultView || activeWindow;
    // Create the tooltip-like div
    tooltip = doc.createElement('div');
    tooltip.classList.add('query-control-sort-tooltip');
    const rect = buttonElement.getBoundingClientRect();
    const top = rect.bottom + win.scrollY + 5;
    const left = rect.left + win.scrollX;
    tooltip.style.setProperty('--tooltip-top', `${top}px`);
    tooltip.style.setProperty('--tooltip-left', `${left}px`);


    // Populate the tooltip with options
    options.forEach(option => {
        const optionEl = doc.createElement('div');
        optionEl.classList.add('query-control-sort-option');
        optionEl.textContent = option.label;

        if (option.key === currentSortOrder) {
            optionEl.setAttribute('aria-current', 'true');
            const checkmarkSpan = doc.createElement('span');
            checkmarkSpan.textContent = '✓'; // Unicode checkmark
            checkmarkSpan.classList.add('query-control-sort-option-checkmark');
            optionEl.appendChild(checkmarkSpan);
        }

        optionEl.addEventListener('click', () => {
            setSortOrderCallback(option.key); // Pass the key
            removeEventListeners();
        });

        tooltip.appendChild(optionEl); // Add each option to the tooltip
    });

    // Append the tooltip to the body
    doc.body.appendChild(tooltip);

    removeEventListeners = () => {
        doc.removeEventListener('mousedown', outsideClickListener, true);
        doc.removeEventListener('touchstart', outsideClickListener, true);
        doc.removeEventListener('click', outsideClickListener);
        doc.removeEventListener('keydown', keydownListener, true);
        app.workspace.off('active-leaf-change', onWorkspaceChange);
        tooltip.remove();
        tooltip = undefined;
    };

    const onWorkspaceChange = () => {
        if (tooltip.parentElement) {
            tooltip.remove();
            removeEventListeners();
        }
    };


    const outsideClickListener = (event: MouseEvent | TouchEvent) => {
        const target = event.target;
        if (target instanceof Node && !tooltip.contains(target) && !buttonElement.contains(target)) {
            tooltip.remove();
            removeEventListeners();
        }
    };

    const keydownListener = (event: KeyboardEvent) => {
        tooltip.remove();
        removeEventListeners();
    };

    doc.addEventListener('mousedown', outsideClickListener, true);
    doc.addEventListener('touchstart', outsideClickListener, true);
    doc.addEventListener('click', outsideClickListener);
    doc.addEventListener('keydown', keydownListener, true);
    app.workspace.on('active-leaf-change', onWorkspaceChange);
}

