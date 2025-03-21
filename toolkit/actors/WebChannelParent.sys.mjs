/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { WebChannelBroker } from "resource://gre/modules/WebChannel.sys.mjs";

// Note: ERRNO 1 deprecated and unused.
// We used to err for cases where the child did not send a principal,
// but now we infer it from the actor.
const ERRNO_NO_SUCH_CHANNEL = 2;

export class WebChannelParent extends JSWindowActorParent {
  receiveMessage(msg) {
    let data = msg.data.contentData;
    let sendingContext = {
      browsingContext: this.browsingContext,
      browser: this.browsingContext.top.embedderElement,
      eventTarget: msg.data.eventTarget,
      principal: this.manager.documentPrincipal,
    };
    // data must be a string except for a few legacy origins allowed by browser-content.js.
    if (typeof data == "string") {
      try {
        data = JSON.parse(data);
      } catch (e) {
        console.error("Failed to parse WebChannel data as a JSON object");
        return;
      }
    }

    if (data && data.id) {
      let validChannelFound = WebChannelBroker.tryToDeliver(
        data,
        sendingContext
      );

      // if no valid origins send an event that there is no such valid channel
      if (!validChannelFound) {
        this._sendErrorEventToContent(
          data.id,
          sendingContext,
          ERRNO_NO_SUCH_CHANNEL,
          "No Such Channel"
        );
      }
    } else {
      console.error("WebChannel channel id missing");
    }
  }

  /**
   *
   * @param id {String}
   *        The WebChannel id to include in the message
   * @param sendingContext {Object}
   *        Message sending context
   * @param [errorMsg] {String}
   *        Error message
   * @private
   */
  _sendErrorEventToContent(id, sendingContext, errorNo, errorMsg) {
    let { eventTarget, principal } = sendingContext;

    errorMsg = errorMsg || "Web Channel Parent error";

    let { currentWindowGlobal = null } = this.browsingContext;
    if (currentWindowGlobal) {
      currentWindowGlobal
        .getActor("WebChannel")
        .sendAsyncMessage("WebChannelMessageToContent", {
          id,
          message: {
            errno: errorNo,
            error: errorMsg,
          },
          eventTarget,
          principal,
        });
    } else {
      console.error("Failed to send a WebChannel error. Target invalid.");
    }
    console.error(id.toString() + " error message. ", errorMsg);
  }
}
