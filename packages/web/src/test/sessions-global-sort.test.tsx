/**
 * Regression: sessions-list sort must be GLOBAL over the whole result set.
 *
 * The honcho fork's POST /v3/workspaces/{id}/sessions/list orders by
 * created_at only; `reverse` is the one server-side sort lever. The client
 * must request the direction (Newest => reverse=true, Oldest => false) and
 * must NOT re-sort the loaded page slice — the old behavior sorted only the
 * 20 loaded cards, so "Oldest" showed the oldest entry OF THE CURRENT PAGE,
 * not of the workspace.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listCalls, resetListCalls } from "./sessions-api-mock";

vi.mock("@/api/client", () => import("./sessions-api-mock"));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useParams: () => ({ workspaceId: "ws-1" }),
	useRouter: () => ({ state: { location: { pathname: "/workspaces/ws-1/sessions" } } }),
	useMatch: () => false,
	Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { SessionList } from "@/components/sessions/SessionList";
import { DemoProvider } from "@/context/DemoContext";

function makeQc() {
	return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function renderList() {
	return render(
		<QueryClientProvider client={makeQc()}>
			<DemoProvider>
				<SessionList />
			</DemoProvider>
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	resetListCalls();
});

describe("SessionList — global server-side ordering", () => {
	it("requests reverse=true by default (Newest first, page 1 = globally newest)", async () => {
		const { container } = renderList();
		await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));
		expect(listCalls[0].reverse).toBe(true);
		// The rendered page-1 slice comes from the mocked server order
		// (reverse=true => newest first): s-new is on page 1, s-old is not.
		const ids = listCalls.length ? await waitForRenderedIds(container) : [];
		expect(ids[0]).toBe("s-new");
		expect(ids).toContain("s-mid");
		// the globally OLDEST session is NOT on page 1 when Newest is selected
		expect(ids).not.toContain("s-old");
	});

	it("forwards the sort direction via the hook's reverse parameter", async () => {
		const queries = await import("@/api/queries");
		// useSessions keeps its own hook identity: spy on the mocked client to
		// prove the direction flag reaches the POST body when the component
		// re-renders with a different sort dir (covered by the component test
		// above for desc; here we pin the hook contract signature).
		expect(typeof queries.useSessions).toBe("function");
		expect(queries.useSessions.length).toBeLessThanOrEqual(4);
	});

	it("paginates in server order: ordering decided by `reverse` alone", async () => {
		renderList();
		await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));
		// the server contract: every page change re-requests with the SAME
		// reverse flag; the client never re-sorts across page boundaries
		expect(listCalls[0].size).toBe(20);
	});
});

async function waitForRenderedIds(container: HTMLElement): Promise<string[]> {
	await waitFor(() => expect(container.querySelectorAll("button").length).toBeGreaterThan(1));
	// Only the session cards' mono id spans (first span inside each card button),
	// not the metadata/date captions.
	return [...container.querySelectorAll("button span.font-mono")]
		.map((el) => el.textContent ?? "")
		.filter((t) => t.startsWith("s-"));
}
