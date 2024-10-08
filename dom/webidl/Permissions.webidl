/* -*- Mode: IDL; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * The origin of this IDL file is
 * https://w3c.github.io/permissions/#permissions-interface
 */

enum PermissionName {
  "geolocation",
  "notifications",
  "push",
  "persistent-storage",
  "midi",
  "storage-access", // Defined in https://privacycg.github.io/storage-access/#permissions-integration
  "screen-wake-lock", // Defined in https://w3c.github.io/screen-wake-lock/
  "camera",    // Defined in https://www.w3.org/TR/mediacapture-streams/#permissions-integration
  "microphone" // Defined in https://www.w3.org/TR/mediacapture-streams/#permissions-integration
};

[GenerateInit]
dictionary PermissionDescriptor {
  required PermissionName name;
};

// https://webaudio.github.io/web-midi-api/#permissions-integration
[GenerateInit]
dictionary MidiPermissionDescriptor : PermissionDescriptor {
  boolean sysex = false;
};

// We don't implement `PushPermissionDescriptor` because we use a background
// message quota instead of `userVisibleOnly`.

[Exposed=(Window,Worker)]
interface Permissions {
  [NewObject]
  Promise<PermissionStatus> query(object permission);

  // http://w3c.github.io/permissions/#webdriver-command-set-permission
  [ChromeOnly, Throws]
  PermissionStatus parseSetParameters(PermissionSetParameters parameters);
};
