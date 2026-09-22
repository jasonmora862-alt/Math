from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox','--disable-web-security','--allow-file-access-from-files'])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.goto((ROOT / 'index.html').as_uri(), wait_until='load')
    page.wait_for_timeout(800)

    assert [x.strip() for x in page.locator('.nav-btn small').all_text_contents()] == ['Learn', 'Map', 'Progress', 'More']
    page.locator('#learnSearch').fill('linear algebra')
    page.wait_for_timeout(150)
    assert page.locator('#learnSearchResults [data-node-id]').count() > 0
    page.locator('#learnSearchResults [data-node-id]').first.click()
    page.wait_for_timeout(150)
    assert page.locator('#continueCard').is_visible()
    assert page.locator('#sessionCard').is_visible()
    assert 'Prerequisite relations are not present' in page.locator('#prereqAvailability').inner_text()

    page.locator('#recordIndependentPracticeBtn').click()
    page.wait_for_timeout(150)
    page.get_by_role('button', name='Progress').click()
    page.wait_for_timeout(100)
    assert 'Independent practice' in page.locator('#progressList').inner_text()
    assert '%' not in page.locator('#progressList').inner_text()

    page.get_by_role('button', name='Learn').click()
    page.locator('#sessionWhyBtn').click()
    assert page.locator('#whyDialog').is_visible()
    assert 'Supported, not established' in page.locator('#whyEvidenceState').inner_text()
    page.locator('#whyDialog button[value="cancel"]').first.click()

    page.get_by_role('button', name='More').click()
    page.locator('#pilotConsentCheck').check()
    page.locator('#startPilotBtn').click()
    page.wait_for_timeout(100)
    assert page.locator('#pilotActivePanel').is_visible()
    page.locator('#openScenarioLabBtn').click()
    assert page.locator('#scenarioDialog').is_visible()
    assert 'Pilot scenario' in page.locator('#scenarioDialog').inner_text()
    assert 'Target B' in page.locator('#scenarioContent').inner_text()
    page.locator('#scenarioDialog button[value="cancel"]').first.click()

    page.locator('#withdrawPilotBtn').click()
    assert page.locator('#withdrawDialog').is_visible()
    page.locator('#withdrawDeleteBtn').click()
    page.wait_for_timeout(100)
    assert page.locator('#pilotInactivePanel').is_visible()

    browser.close()
print('UI_SMOKE_PASS')
