/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_fetcheventopproxychild_h__
#define mozilla_dom_fetcheventopproxychild_h__

#include "nsISupportsImpl.h"

#include "ServiceWorkerOp.h"
#include "ServiceWorkerOpPromise.h"
#include "mozilla/MozPromise.h"
#include "mozilla/RefPtr.h"
#include "mozilla/dom/InternalRequest.h"
#include "mozilla/dom/PFetchEventOpProxyChild.h"

namespace mozilla::dom {

class InternalRequest;
class InternalResponse;
class ParentToChildServiceWorkerFetchEventOpArgs;

class FetchEventOpProxyChild final : public PFetchEventOpProxyChild {
  friend class PFetchEventOpProxyChild;

 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(FetchEventOpProxyChild, override);

  FetchEventOpProxyChild() = default;

  void Initialize(const ParentToChildServiceWorkerFetchEventOpArgs& aArgs);

  // Must only be called once and on a worker thread.
  SafeRefPtr<InternalRequest> ExtractInternalRequest();

  RefPtr<FetchEventPreloadResponseAvailablePromise>
  GetPreloadResponseAvailablePromise();

  RefPtr<FetchEventPreloadResponseTimingPromise>
  GetPreloadResponseTimingPromise();

  RefPtr<FetchEventPreloadResponseEndPromise> GetPreloadResponseEndPromise();

 private:
  ~FetchEventOpProxyChild() = default;

  mozilla::ipc::IPCResult RecvPreloadResponse(
      ParentToChildInternalResponse&& aResponse);

  mozilla::ipc::IPCResult RecvPreloadResponseTiming(ResponseTiming&& aTiming);

  mozilla::ipc::IPCResult RecvPreloadResponseEnd(ResponseEndArgs&& aArgs);

  void ActorDestroy(ActorDestroyReason) override;

  MozPromiseRequestHolder<FetchEventRespondWithPromise>
      mRespondWithPromiseRequestHolder;

  RefPtr<FetchEventOp> mOp;

  // Initialized on RemoteWorkerService::Thread, read on a worker thread.
  SafeRefPtr<InternalRequest> mInternalRequest;

  RefPtr<FetchEventPreloadResponseAvailablePromise::Private>
      mPreloadResponseAvailablePromise;
  RefPtr<FetchEventPreloadResponseTimingPromise::Private>
      mPreloadResponseTimingPromise;
  RefPtr<FetchEventPreloadResponseEndPromise::Private>
      mPreloadResponseEndPromise;

  // MozPromise intentionally does not expose synchronous access to the
  // resolved/rejected state of a promise, so track whether or not we've
  // resolved these promises manually.
  bool mPreloadResponseAvailablePromiseResolved = false;
  bool mPreloadResponseEndPromiseResolved = false;

  Maybe<ServiceWorkerOpResult> mCachedOpResult;
};

}  // namespace mozilla::dom

#endif  // mozilla_dom_fetcheventopproxychild_h__
