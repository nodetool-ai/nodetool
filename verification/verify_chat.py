from playwright.sync_api import Page, expect, sync_playwright

def verify_chat_thread(page: Page):
    # Navigate to the verification page
    # Since VITE_FORCE_LOCALHOST might be needed, we can append ?forceLocalhost=1
    page.goto("http://localhost:3000/verification?forceLocalhost=1")

    # Wait for the page to load
    page.wait_for_load_state("networkidle")

    # Assert that messages are visible
    expect(page.get_by_text("Hello, can you help me optimize this code?")).to_be_visible()
    expect(page.get_by_text("Certainly! I can help you with that.")).to_be_visible()

    # Assert that the code block is rendered
    expect(page.get_by_text("const x = 1;")).to_be_visible()

    # Assert status update
    # The page simulates streaming, so it might transition to "connected" quickly.
    # We check if the status text is present.
    expect(page.get_by_text("Status:")).to_be_visible()

    # Wait for a bit to capture the UI state
    page.wait_for_timeout(2000)

    # Take a screenshot
    page.screenshot(path="verification/verification.png")
    print("Screenshot saved to verification/verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_chat_thread(page)
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()
