import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { I18nProvider } from "../i18n";
import PlanView from "./PlanView";

afterEach(cleanup);

test("the plan lets a person pick a room and then a surface", () => {
  const onRoom = vi.fn();
  const onSurface = vi.fn();
  const { rerender } = render(
    <I18nProvider language="uk">
      <PlanView
        room={null}
        surface={null}
        selected={null}
        onRoom={onRoom}
        onSurface={onSurface}
        onItem={vi.fn()}
      />
    </I18nProvider>,
  );
  fireEvent.click(
    screen.getByText("Ванна кімната", { selector: "title" }).parentElement as Element,
  );
  expect(onRoom).toHaveBeenCalledWith("bathroom");

  rerender(
    <I18nProvider language="uk">
      <PlanView
        room="bathroom"
        surface={null}
        selected={null}
        onRoom={onRoom}
        onSurface={onSurface}
        onItem={vi.fn()}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByText("Душова", { selector: "title" }).parentElement as Element);
  expect(onSurface).toHaveBeenCalledWith("shower");
});
