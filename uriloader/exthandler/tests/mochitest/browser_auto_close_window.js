/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { ComponentUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/ComponentUtils.sys.mjs"
);

const ROOT = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);
const PAGE_URL = ROOT + "download_page.html";
const SJS_URL = ROOT + "download.sjs";

const HELPERAPP_DIALOG_CONTRACT_ID = "@mozilla.org/helperapplauncherdialog;1";
const HELPERAPP_DIALOG_CID = Components.ID(
  Cc[HELPERAPP_DIALOG_CONTRACT_ID].number
);
const MOCK_HELPERAPP_DIALOG_CID = Components.ID(
  "{2f372b6f-56c9-46d5-af0d-9f09bb69860c}"
);

let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
let curDialogResolve = null;

function HelperAppLauncherDialog() {}

HelperAppLauncherDialog.prototype = {
  show(aLauncher, aWindowContext) {
    ok(true, "Showing the helper app dialog");
    curDialogResolve(aWindowContext);
    executeSoon(() => {
      aLauncher.cancel(Cr.NS_ERROR_ABORT);
    });
  },
  QueryInterface: ChromeUtils.generateQI(["nsIHelperAppLauncherDialog"]),
};

function promiseHelperAppDialog() {
  return new Promise(resolve => {
    curDialogResolve = resolve;
  });
}

let mockHelperAppService;

add_setup(async function () {
  // Replace the real helper app dialog with our own.
  mockHelperAppService = ComponentUtils.generateSingletonFactory(
    HelperAppLauncherDialog
  );
  registrar.registerFactory(
    MOCK_HELPERAPP_DIALOG_CID,
    "",
    HELPERAPP_DIALOG_CONTRACT_ID,
    mockHelperAppService
  );

  // Ensure we always prompt for these downloads.
  const HandlerService = Cc[
    "@mozilla.org/uriloader/handler-service;1"
  ].getService(Ci.nsIHandlerService);

  const MIMEService = Cc["@mozilla.org/mime;1"].getService(Ci.nsIMIMEService);
  const mimeInfo = MIMEService.getFromTypeAndExtension(
    "application/octet-stream",
    "bin"
  );
  mimeInfo.alwaysAskBeforeHandling = true;
  HandlerService.store(mimeInfo);

  // On Mac, .bin is application/macbinary
  let mimeInfoMac;
  if (AppConstants.platform == "macosx") {
    mimeInfoMac = MIMEService.getFromTypeAndExtension(
      "application/macbinary",
      "bin"
    );
    mimeInfoMac.alwaysAskBeforeHandling = true;
    HandlerService.store(mimeInfoMac);
  }

  registerCleanupFunction(() => {
    HandlerService.remove(mimeInfo);
    if (mimeInfoMac) {
      HandlerService.remove(mimeInfoMac);
    }
  });
});

add_task(async function simple_navigation() {
  // Tests that simple navigation gives us the right windowContext (that is,
  // the window that we're using).
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async function (browser) {
      let dialogAppeared = promiseHelperAppDialog();
      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#regular_load",
        {},
        browser
      );
      let windowContext = await dialogAppeared;

      is(windowContext, browser.ownerGlobal, "got the right windowContext");
    }
  );
});

add_task(async function accel_navigation() {
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async function (browser) {
      let dialogAppeared = promiseHelperAppDialog();
      let tabOpened = BrowserTestUtils.waitForEvent(
        gBrowser.tabContainer,
        "TabOpen"
      ).then(event => {
        return [event.target, BrowserTestUtils.waitForTabClosing(event.target)];
      });

      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#regular_load",
        { accelKey: true },
        browser
      );

      let windowContext = await dialogAppeared;
      is(windowContext, browser.ownerGlobal, "got the right windowContext");
      let [tab, closingPromise] = await tabOpened;
      await closingPromise;
      is(tab.linkedBrowser, null, "tab was opened and closed");
    }
  );
});

// Given a browser pointing to download_page.html, clicks on the link that
// opens with target="_blank" (i.e. a new tab) and ensures that we
// automatically open and close that tab.
async function testNewTab(browser) {
  let dialogAppeared = promiseHelperAppDialog();
  let tabOpened = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer,
    "TabOpen"
  ).then(event => {
    return [event.target, BrowserTestUtils.waitForTabClosing(event.target)];
  });

  await BrowserTestUtils.synthesizeMouseAtCenter("#target_blank", {}, browser);

  let windowContext = await dialogAppeared;
  is(windowContext, browser.ownerGlobal, "got the right windowContext");
  let [tab, closingPromise] = await tabOpened;
  await closingPromise;
  is(tab.linkedBrowser, null, "tab was opened and closed");
}

add_task(async function target_blank() {
  // Tests that a link with target=_blank opens a new tab and closes it,
  // returning the window that we're using for navigation.
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async function (browser) {
      await testNewTab(browser);
    }
  );
});

add_task(async function target_blank_no_opener() {
  // Tests that a link with target=_blank and no opener opens a new tab
  // and closes it, returning the window that we're using for navigation.
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async function (browser) {
      let dialogAppeared = promiseHelperAppDialog();
      let tabOpened = BrowserTestUtils.waitForEvent(
        gBrowser.tabContainer,
        "TabOpen"
      ).then(event => {
        return [event.target, BrowserTestUtils.waitForTabClosing(event.target)];
      });

      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#target_blank_no_opener",
        {},
        browser
      );

      let windowContext = await dialogAppeared;
      is(windowContext, browser.ownerGlobal, "got the right windowContext");
      let [tab, closingPromise] = await tabOpened;
      await closingPromise;
      is(tab.linkedBrowser, null, "tab was opened and closed");
    }
  );
});

add_task(async function open_in_new_tab_no_opener() {
  // Tests that a link with target=_blank and no opener opens a new tab
  // and closes it, returning the window that we're using for navigation.
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async function (browser) {
      let dialogAppeared = promiseHelperAppDialog();
      let tabOpened = BrowserTestUtils.waitForEvent(
        gBrowser.tabContainer,
        "TabOpen"
      ).then(event => {
        return [event.target, BrowserTestUtils.waitForTabClosing(event.target)];
      });

      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#open_in_new_tab_no_opener",
        {},
        browser
      );

      let windowContext = await dialogAppeared;
      is(windowContext, browser.ownerGlobal, "got the right windowContext");
      let [tab, closingPromise] = await tabOpened;
      await closingPromise;
      is(tab.linkedBrowser, null, "tab was opened and closed");
    }
  );
});

add_task(async function new_window() {
  // Tests that a link that forces us to open a new window (by specifying a
  // width and a height in window.open) opens a new window for the load,
  // realizes that we need to close that window and returns the *original*
  // window as the window context.
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async function (browser) {
      let dialogAppeared = promiseHelperAppDialog();
      let windowOpened = BrowserTestUtils.waitForNewWindow();

      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#new_window",
        {},
        browser
      );
      let win = await windowOpened;
      // Now allow request to complete:
      fetch(SJS_URL + "?finish");

      let windowContext = await dialogAppeared;
      is(windowContext, browser.ownerGlobal, "got the right windowContext");

      // The window should close on its own. If not, this test will time out.
      await BrowserTestUtils.domWindowClosed(win);
      ok(win.closed, "window was opened and closed");

      is(
        await fetch(SJS_URL + "?reset").then(r => r.text()),
        "OK",
        "Test reseted"
      );
    }
  );
});

add_task(async function new_window_no_opener() {
  // Tests that a link that forces us to open a new window (by specifying a
  // width and a height in window.open) opens a new window for the load,
  // realizes that we need to close that window and returns the *original*
  // window as the window context.
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async function (browser) {
      let dialogAppeared = promiseHelperAppDialog();
      let windowOpened = BrowserTestUtils.waitForNewWindow();

      await BrowserTestUtils.synthesizeMouseAtCenter(
        "#new_window_no_opener",
        {},
        browser
      );
      let win = await windowOpened;
      // Now allow request to complete:
      fetch(SJS_URL + "?finish");

      await dialogAppeared;

      // The window should close on its own. If not, this test will time out.
      await BrowserTestUtils.domWindowClosed(win);
      ok(win.closed, "window was opened and closed");

      is(
        await fetch(SJS_URL + "?reset").then(r => r.text()),
        "OK",
        "Test reseted"
      );
    }
  );
});

add_task(async function nested_window_opens() {
  // Tests that the window auto-closing feature works if the download is
  // initiated by a window that, itself, has an opener (see bug 1373109).
  await BrowserTestUtils.withNewTab(
    { gBrowser, url: PAGE_URL },
    async function (outerBrowser) {
      let secondTabPromise = BrowserTestUtils.waitForNewTab(
        gBrowser,
        `${PAGE_URL}?newwin`,
        true
      );
      BrowserTestUtils.synthesizeMouseAtCenter(
        "#open_in_new_tab",
        {},
        outerBrowser
      );
      let secondTab = await secondTabPromise;
      let nestedBrowser = secondTab.linkedBrowser;

      await SpecialPowers.spawn(nestedBrowser, [], function () {
        ok(content.opener, "this window has an opener");
      });

      await testNewTab(nestedBrowser);

      isnot(
        secondTab.linkedBrowser,
        null,
        "the page that triggered the download is still open"
      );
      BrowserTestUtils.removeTab(secondTab);
    }
  );
});

add_task(async function cleanup() {
  // Unregister our factory from XPCOM and restore the original CID.
  registrar.unregisterFactory(MOCK_HELPERAPP_DIALOG_CID, mockHelperAppService);
  registrar.registerFactory(
    HELPERAPP_DIALOG_CID,
    "",
    HELPERAPP_DIALOG_CONTRACT_ID,
    null
  );
});
