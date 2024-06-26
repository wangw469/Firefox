"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

ChromeUtils.defineLazyGetter(this, "URL", function () {
  return "http://localhost:" + httpServer.identity.primaryPort;
});

var httpServer = null;
// Need to randomize, because apparently no one clears our cache
var randomPath = "/redirect/" + Math.random();

ChromeUtils.defineLazyGetter(this, "randomURI", function () {
  return URL + randomPath;
});

function make_channel(url) {
  return NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true });
}

const redirectTargetBody = "response body";
const response301Body = "redirect body";

function redirectHandler(metadata, response) {
  response.setStatusLine(metadata.httpVersion, 301, "Moved");
  response.bodyOutputStream.write(response301Body, response301Body.length);
  response.setHeader(
    "Location",
    "data:text/plain," + redirectTargetBody,
    false
  );
}

function finish_test(request, buffer) {
  Assert.equal(buffer, redirectTargetBody);
  httpServer.stop(do_test_finished);
}

function run_test() {
  httpServer = new HttpServer();
  httpServer.registerPathHandler(randomPath, redirectHandler);
  httpServer.start(-1);

  var chan = make_channel(randomURI);
  chan.asyncOpen(new ChannelListener(finish_test, null, 0));
  do_test_pending();
}
