/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MediaPlaybackStatus.h"

#include "MediaControlUtils.h"

namespace mozilla::dom {

#undef LOG
#define LOG(msg, ...)                        \
  MOZ_LOG(gMediaControlLog, LogLevel::Debug, \
          ("MediaPlaybackStatus=%p, " msg, this, ##__VA_ARGS__))

void MediaPlaybackStatus::UpdateMediaPlaybackState(uint64_t aContextId,
                                                   MediaPlaybackState aState) {
  LOG("Update playback state '%s' for context %" PRIu64,
      EnumValueToString(aState), aContextId);
  MOZ_ASSERT(NS_IsMainThread());

  ContextMediaInfo& info = GetNotNullContextInfo(aContextId);
  if (aState == MediaPlaybackState::eStarted) {
    info.IncreaseControlledMediaNum();
  } else if (aState == MediaPlaybackState::eStopped) {
    info.DecreaseControlledMediaNum();
  } else if (aState == MediaPlaybackState::ePlayed) {
    info.IncreasePlayingMediaNum();
  } else {
    MOZ_ASSERT(aState == MediaPlaybackState::ePaused);
    info.DecreasePlayingMediaNum();
  }

  // The context still has controlled media, we should keep its alive.
  if (info.IsAnyMediaBeingControlled()) {
    return;
  }
  MOZ_ASSERT(!info.IsPlaying());
  MOZ_ASSERT(!info.IsAudible());
  // DO NOT access `info` after this line.
  DestroyContextInfo(aContextId);
}

void MediaPlaybackStatus::DestroyContextInfo(uint64_t aContextId) {
  MOZ_ASSERT(NS_IsMainThread());
  LOG("Remove context %" PRIu64, aContextId);
  mContextInfoMap.Remove(aContextId);
  // If the removed context is owning the audio focus, we would find another
  // context to take the audio focus if it's possible.
  if (IsContextOwningAudioFocus(aContextId)) {
    ChooseNewContextToOwnAudioFocus();
  }
}

void MediaPlaybackStatus::UpdateMediaAudibleState(uint64_t aContextId,
                                                  MediaAudibleState aState) {
  LOG("Update audible state '%s' for context %" PRIu64,
      EnumValueToString(aState), aContextId);
  MOZ_ASSERT(NS_IsMainThread());
  ContextMediaInfo& info = GetNotNullContextInfo(aContextId);
  if (aState == MediaAudibleState::eAudible) {
    info.IncreaseAudibleMediaNum();
  } else {
    MOZ_ASSERT(aState == MediaAudibleState::eInaudible);
    info.DecreaseAudibleMediaNum();
  }
  if (ShouldRequestAudioFocusForInfo(info)) {
    SetOwningAudioFocusContextId(Some(aContextId));
  } else if (ShouldAbandonAudioFocusForInfo(info)) {
    ChooseNewContextToOwnAudioFocus();
  }
}

void MediaPlaybackStatus::UpdateGuessedPositionState(
    uint64_t aContextId, const nsID& aElementId,
    const Maybe<PositionState>& aState) {
  MOZ_ASSERT(NS_IsMainThread());
  if (aState) {
    LOG("Update guessed position state for context %" PRIu64
        " element %s (duration=%f, playbackRate=%f, position=%f)",
        aContextId, aElementId.ToString().get(), aState->mDuration,
        aState->mPlaybackRate, aState->mLastReportedPlaybackPosition);
  } else {
    LOG("Clear guessed position state for context %" PRIu64 " element %s",
        aContextId, aElementId.ToString().get());
  }
  ContextMediaInfo& info = GetNotNullContextInfo(aContextId);
  info.UpdateGuessedPositionState(aElementId, aState);
}

bool MediaPlaybackStatus::IsPlaying() const {
  MOZ_ASSERT(NS_IsMainThread());
  return std::any_of(mContextInfoMap.Values().cbegin(),
                     mContextInfoMap.Values().cend(),
                     [](const auto& info) { return info->IsPlaying(); });
}

bool MediaPlaybackStatus::IsAudible() const {
  MOZ_ASSERT(NS_IsMainThread());
  return std::any_of(mContextInfoMap.Values().cbegin(),
                     mContextInfoMap.Values().cend(),
                     [](const auto& info) { return info->IsAudible(); });
}

bool MediaPlaybackStatus::IsAnyMediaBeingControlled() const {
  MOZ_ASSERT(NS_IsMainThread());
  return std::any_of(
      mContextInfoMap.Values().cbegin(), mContextInfoMap.Values().cend(),
      [](const auto& info) { return info->IsAnyMediaBeingControlled(); });
}

Maybe<PositionState> MediaPlaybackStatus::GuessedMediaPositionState(
    Maybe<uint64_t> aPreferredContextId) const {
  auto contextId = aPreferredContextId;
  if (!contextId) {
    contextId = mOwningAudioFocusContextId;
  }

  // either the preferred or focused context
  if (contextId) {
    auto entry = mContextInfoMap.Lookup(*contextId);
    if (!entry) {
      return Nothing();
    }
    LOG("Using guessed position state from preferred/focused BC %" PRId64,
        *contextId);
    return entry.Data()->GuessedPositionState();
  }

  // look for the first position state
  for (const auto& context : mContextInfoMap.Values()) {
    auto state = context->GuessedPositionState();
    if (state) {
      LOG("Using guessed position state from BC %" PRId64, context->Id());
      return state;
    }
  }
  return Nothing();
}

MediaPlaybackStatus::ContextMediaInfo&
MediaPlaybackStatus::GetNotNullContextInfo(uint64_t aContextId) {
  MOZ_ASSERT(NS_IsMainThread());
  return *mContextInfoMap.GetOrInsertNew(aContextId, aContextId);
}

Maybe<uint64_t> MediaPlaybackStatus::GetAudioFocusOwnerContextId() const {
  return mOwningAudioFocusContextId;
}

void MediaPlaybackStatus::ChooseNewContextToOwnAudioFocus() {
  for (const auto& info : mContextInfoMap.Values()) {
    if (info->IsAudible()) {
      SetOwningAudioFocusContextId(Some(info->Id()));
      return;
    }
  }
  // No context is audible, so no one should the own audio focus.
  SetOwningAudioFocusContextId(Nothing());
}

void MediaPlaybackStatus::SetOwningAudioFocusContextId(
    Maybe<uint64_t>&& aContextId) {
  if (mOwningAudioFocusContextId == aContextId) {
    return;
  }
  mOwningAudioFocusContextId = aContextId;
}

bool MediaPlaybackStatus::ShouldRequestAudioFocusForInfo(
    const ContextMediaInfo& aInfo) const {
  return aInfo.IsAudible() && !IsContextOwningAudioFocus(aInfo.Id());
}

bool MediaPlaybackStatus::ShouldAbandonAudioFocusForInfo(
    const ContextMediaInfo& aInfo) const {
  // The owner becomes inaudible and there is other context still playing, so we
  // should switch the audio focus to the audible context.
  return !aInfo.IsAudible() && IsContextOwningAudioFocus(aInfo.Id()) &&
         IsAudible();
}

bool MediaPlaybackStatus::IsContextOwningAudioFocus(uint64_t aContextId) const {
  return mOwningAudioFocusContextId ? *mOwningAudioFocusContextId == aContextId
                                    : false;
}

Maybe<PositionState>
MediaPlaybackStatus::ContextMediaInfo::GuessedPositionState() const {
  if (mGuessedPositionStateMap.Count() != 1) {
    LOG("Count is %d", mGuessedPositionStateMap.Count());
    return Nothing();
  }
  return Some(mGuessedPositionStateMap.begin()->GetData());
}

void MediaPlaybackStatus::ContextMediaInfo::UpdateGuessedPositionState(
    const nsID& aElementId, const Maybe<PositionState>& aState) {
  if (aState) {
    mGuessedPositionStateMap.InsertOrUpdate(aElementId, *aState);
  } else {
    mGuessedPositionStateMap.Remove(aElementId);
  }
}

}  // namespace mozilla::dom
