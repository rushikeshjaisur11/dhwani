/**
 * Windows Copy Selection Helper for Dhwani
 *
 * Releases any held modifier keys (Win, Alt, Ctrl, Shift) and simulates
 * Ctrl+C to copy selected text, then restores modifiers.
 * Option `--esc` prepends an Escape key to dismiss any active menus.
 *
 * Compile with: cl /O2 windows-copy-selection.c /Fe:windows-copy-selection.exe user32.lib
 * Or with MinGW: gcc -O2 windows-copy-selection.c -o windows-copy-selection.exe -luser32
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const WORD MODIFIER_VKS[] = {
    VK_LCONTROL, VK_RCONTROL,
    VK_LSHIFT,   VK_RSHIFT,
    VK_LMENU,    VK_RMENU,
    VK_LWIN,     VK_RWIN,
};
#define NUM_MODIFIERS (sizeof(MODIFIER_VKS) / sizeof(MODIFIER_VKS[0]))

static void SetKey(INPUT* input, WORD vk, DWORD flags) {
    input->type = INPUT_KEYBOARD;
    input->ki.wVk = vk;
    input->ki.wScan = (WORD)MapVirtualKeyA(vk, MAPVK_VK_TO_VSC);
    input->ki.dwFlags = flags;
}

static int ReleaseModifiers(INPUT* released, WORD* releasedVKs) {
    int count = 0;
    BOOL winHeld = FALSE;
    for (int i = 0; i < (int)NUM_MODIFIERS; i++) {
        if (GetAsyncKeyState(MODIFIER_VKS[i]) & 0x8000) {
            if (MODIFIER_VKS[i] == VK_LWIN || MODIFIER_VKS[i] == VK_RWIN) {
                winHeld = TRUE;
            }
            releasedVKs[count] = MODIFIER_VKS[i];
            SetKey(&released[count], MODIFIER_VKS[i], KEYEVENTF_KEYUP);
            count++;
        }
    }
    if (count > 0) {
        if (winHeld) {
            INPUT dummy[2];
            ZeroMemory(dummy, sizeof(dummy));
            SetKey(&dummy[0], 0xFF, 0);
            SetKey(&dummy[1], 0xFF, KEYEVENTF_KEYUP);
            SendInput(2, dummy, sizeof(INPUT));
        }
        SendInput((UINT)count, released, sizeof(INPUT));
    }
    return count;
}

static void RestoreModifiers(WORD* releasedVKs, int count) {
    if (count == 0) return;
    INPUT restore[NUM_MODIFIERS];
    int actualCount = 0;
    ZeroMemory(restore, sizeof(restore));
    for (int i = 0; i < count; i++) {
        if (GetAsyncKeyState(releasedVKs[i]) & 0x8000) {
            SetKey(&restore[actualCount], releasedVKs[i], 0);
            actualCount++;
        }
    }
    if (actualCount > 0) {
        SendInput((UINT)actualCount, restore, sizeof(INPUT));
    }
}

static int SendCopy(BOOL sendEsc) {
    int inputCount = sendEsc ? 6 : 4;
    INPUT* inputs = (INPUT*)malloc(sizeof(INPUT) * inputCount);
    if (!inputs) return 1;
    ZeroMemory(inputs, sizeof(INPUT) * inputCount);

    int idx = 0;
    if (sendEsc) {
        SetKey(&inputs[idx++], VK_ESCAPE, 0);
        SetKey(&inputs[idx++], VK_ESCAPE, KEYEVENTF_KEYUP);
    }
    SetKey(&inputs[idx++], VK_LCONTROL, 0);
    SetKey(&inputs[idx++], 'C', 0);
    SetKey(&inputs[idx++], 'C', KEYEVENTF_KEYUP);
    SetKey(&inputs[idx++], VK_LCONTROL, KEYEVENTF_KEYUP);

    UINT sent = SendInput((UINT)inputCount, inputs, sizeof(INPUT));
    free(inputs);
    return (sent == (UINT)inputCount) ? 0 : 1;
}

int main(int argc, char* argv[]) {
    BOOL sendEsc = FALSE;
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--esc") == 0) {
            sendEsc = TRUE;
        }
    }

    // Release held modifiers
    INPUT releasedInputs[NUM_MODIFIERS];
    WORD  releasedVKs[NUM_MODIFIERS];
    ZeroMemory(releasedInputs, sizeof(releasedInputs));
    int releasedCount = ReleaseModifiers(releasedInputs, releasedVKs);

    // Send copy command
    int result = SendCopy(sendEsc);

    // Restore modifiers
    RestoreModifiers(releasedVKs, releasedCount);

    if (result != 0) {
        fprintf(stderr, "ERROR: SendInput failed\n");
        return 1;
    }

    printf("COPY_OK\n");
    return 0;
}
