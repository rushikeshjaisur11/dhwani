import { describe, it, expect, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      key === "toast.moreCount" && opts ? `+${opts.count} more` : key,
  }),
}));

if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}

import { render, screen, fireEvent, waitForElementToBeRemoved } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { useToast } from "./useToast";

import * as React from "react";

function Trigger({ variant }: { variant?: "default" | "destructive" | "success" }) {
  const { toast } = useToast();
  React.useEffect(() => {
    toast({ title: "Hello", variant });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe("Toast variant icons", () => {
  it("renders an icon svg for the success variant", () => {
    render(
      <ToastProvider>
        <Trigger variant="success" />
      </ToastProvider>
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    const container = screen.getByText("Hello").closest(".toast-surface");
    expect(container?.querySelector("svg")).toBeTruthy();
  });

  it("renders default variant with an icon when no variant is passed", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    const container = screen.getByText("Hello").closest(".toast-surface");
    expect(container?.querySelector("svg")).toBeTruthy();
  });
});

describe("Toast width", () => {
  it("is not capped at the old fixed 300px width class", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    const container = screen.getByText("Hello").closest(".toast-surface");
    expect(container?.className).not.toContain("w-75");
    expect(container?.className).toContain("max-w-[90vw]");
  });
});

describe("toast.promise", () => {
  function PromiseTrigger({ shouldResolve }: { shouldResolve: boolean }) {
    const { promise } = useToast();
    React.useEffect(() => {
      const p = shouldResolve ? Promise.resolve("done") : Promise.reject(new Error("boom"));
      promise(p, {
        loading: "Working...",
        success: (v) => `Success: ${v}`,
        error: "Failed",
      }).catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  it("shows loading then swaps to success in place on resolve", async () => {
    render(
      <ToastProvider>
        <PromiseTrigger shouldResolve={true} />
      </ToastProvider>
    );
    expect(await screen.findByText("Success: done")).toBeInTheDocument();
    expect(screen.queryByText("Working...")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Success: done|Working/).length).toBe(1);
  });

  it("shows loading then swaps to error in place on reject", async () => {
    render(
      <ToastProvider>
        <PromiseTrigger shouldResolve={false} />
      </ToastProvider>
    );
    expect(await screen.findByText("Failed")).toBeInTheDocument();
    expect(screen.queryByText("Working...")).not.toBeInTheDocument();
  });
});

describe("Toast stack cap", () => {
  function ManyTrigger({ count }: { count: number }) {
    const { toast } = useToast();
    React.useEffect(() => {
      for (let i = 0; i < count; i++) {
        toast({ title: `Toast ${i}` });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  it("shows at most 3 toasts and a +N more pill for the rest", () => {
    render(
      <ToastProvider>
        <ManyTrigger count={5} />
      </ToastProvider>
    );
    expect(screen.getAllByText(/^Toast \d$/).length).toBe(3);
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("clicking the overflow pill dismisses every toast", () => {
    render(
      <ToastProvider>
        <ManyTrigger count={5} />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("+2 more"));
    expect(screen.queryAllByText(/^Toast \d$/).length).toBe(0);
  });

  it("does not render the pill when 3 or fewer toasts exist", () => {
    render(
      <ToastProvider>
        <ManyTrigger count={2} />
      </ToastProvider>
    );
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });
});

describe("Toast swipe-to-dismiss", () => {
  it("dismisses when dragged past 40% of its width", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    const surface = screen.getByText("Hello").closest(".toast-surface") as HTMLElement;
    Object.defineProperty(surface, "offsetWidth", { value: 320, configurable: true });

    fireEvent.pointerDown(surface, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 100 - 200, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 100 - 200, pointerId: 1 });

    await waitForElementToBeRemoved(() => screen.queryByText("Hello"));
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  it("snaps back when dragged short of the threshold", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    );
    const surface = screen.getByText("Hello").closest(".toast-surface") as HTMLElement;
    Object.defineProperty(surface, "offsetWidth", { value: 320, configurable: true });

    fireEvent.pointerDown(surface, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 100 - 20, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 100 - 20, pointerId: 1 });

    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
