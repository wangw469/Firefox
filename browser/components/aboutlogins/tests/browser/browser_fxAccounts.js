/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { UIState } = ChromeUtils.importESModule(
  "resource://services-sync/UIState.sys.mjs"
);

const { FxAccounts } = ChromeUtils.importESModule(
  "resource://gre/modules/FxAccounts.sys.mjs"
);
const TEST_ACCOUNT_URL = "https://example.com/";

function mockState(state) {
  UIState.get = () => ({
    status: state.status,
    lastSync: new Date(),
    email: state.email,
    avatarURL: state.avatarURL,
  });
}

add_setup(async function () {
  let aboutLoginsTab = await BrowserTestUtils.openNewForegroundTab({
    gBrowser,
    url: "about:logins",
  });
  let getState = UIState.get;
  sinon.stub(FxAccounts.config, "promiseManageURI").returns(TEST_ACCOUNT_URL);
  registerCleanupFunction(() => {
    BrowserTestUtils.removeTab(aboutLoginsTab);
    UIState.get = getState;
    sinon.restore();
  });
});

add_task(async function test_logged_out() {
  mockState({ status: UIState.STATUS_NOT_CONFIGURED });
  Services.obs.notifyObservers(null, UIState.ON_UPDATE);

  let browser = gBrowser.selectedBrowser;
  await SpecialPowers.spawn(browser, [], async () => {
    let fxAccountsButton = content.document.querySelector("fxaccounts-button");
    Assert.ok(fxAccountsButton, "fxAccountsButton should exist");
    fxAccountsButton = Cu.waiveXrays(fxAccountsButton);
    await ContentTaskUtils.waitForCondition(
      () => fxAccountsButton._loggedIn === false,
      "waiting for _loggedIn to strictly equal false"
    );
    Assert.equal(
      fxAccountsButton._loggedIn,
      false,
      "state should reflect not logged in"
    );
  });
});

add_task(async function test_login_syncing_enabled() {
  const TEST_EMAIL = "test@example.com";
  const TEST_AVATAR_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";
  mockState({
    status: UIState.STATUS_SIGNED_IN,
    email: TEST_EMAIL,
    avatarURL: TEST_AVATAR_URL,
  });
  await SpecialPowers.pushPrefEnv({
    set: [["services.sync.engine.passwords", true]],
  });
  Services.obs.notifyObservers(null, UIState.ON_UPDATE);

  let browser = gBrowser.selectedBrowser;
  await SpecialPowers.spawn(
    browser,
    [[TEST_EMAIL, TEST_AVATAR_URL]],
    async ([expectedEmail, expectedAvatarURL]) => {
      let fxAccountsButton =
        content.document.querySelector("fxaccounts-button");
      Assert.ok(fxAccountsButton, "fxAccountsButton should exist");
      fxAccountsButton = Cu.waiveXrays(fxAccountsButton);
      await ContentTaskUtils.waitForCondition(
        () => fxAccountsButton._email === expectedEmail,
        "waiting for _email to strictly equal expectedEmail"
      );
      Assert.equal(
        fxAccountsButton._loggedIn,
        true,
        "state should reflect logged in"
      );
      Assert.equal(
        fxAccountsButton._email,
        expectedEmail,
        "state should have email set"
      );
      Assert.equal(
        fxAccountsButton._avatarURL,
        expectedAvatarURL,
        "state should have avatarURL set"
      );
    }
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_click_fxaccount() {
  let waitForTabPromise = BrowserTestUtils.waitForNewTab(gBrowser);
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "fxaccounts-button",
    {},
    gBrowser.selectedBrowser
  );
  let tab = await waitForTabPromise;
  info("Tab successfully opened");
  is(tab, gBrowser.selectedTab, "This is a foreground tab.");
  Assert.equal(tab.linkedBrowser.currentURI.spec, TEST_ACCOUNT_URL);
  BrowserTestUtils.removeTab(tab);
  waitForTabPromise = BrowserTestUtils.waitForNewTab(gBrowser);
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "fxaccounts-button",
    { button: 1 },
    gBrowser.selectedBrowser
  );
  tab = await waitForTabPromise;
  info("Tab successfully opened");
  isnot(tab, gBrowser.selectedTab, "This is a background tab.");
  gBrowser.selectedTab = tab;
  Assert.equal(tab.linkedBrowser.currentURI.spec, TEST_ACCOUNT_URL);
  BrowserTestUtils.removeTab(tab);
});
