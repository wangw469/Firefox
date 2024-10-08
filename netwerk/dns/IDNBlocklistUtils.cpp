/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "IDNBlocklistUtils.h"

#include "nsStringFwd.h"

namespace mozilla {
namespace net {

static constexpr char16_t sBlocklistPairs[][2] = {
#include "IDNCharacterBlocklist.inc"
};

void RemoveCharFromBlocklist(char16_t aChar,
                             nsTArray<BlocklistRange>& aBlocklist) {
  auto pos = aBlocklist.BinaryIndexOf(aChar, BlocklistPairToCharComparator());
  if (pos == nsTArray<BlocklistRange>::NoIndex) {
    return;
  }

  auto& pair = aBlocklist[pos];

  // If the matched range has a length of one, we can just remove it
  if (pair.second == pair.first) {
    aBlocklist.RemoveElementAt(pos);
    return;
  }

  // If the character matches the first element in the range, just update
  // the range.
  if (aChar == pair.first) {
    pair.first = pair.first + 1;
    return;
  }

  // Also if it matches the last character in the range, we just update it.
  if (aChar == pair.second) {
    pair.second = pair.second - 1;
    return;
  }

  // Our character is in the middle of the range, splitting it in two.
  // We update the matched range to reflect the values before the character,
  // and insert a new range that represents the values after.
  char16_t lastElement = pair.second;
  pair.second = aChar - 1;
  aBlocklist.InsertElementAt(pos + 1,
                             std::make_pair(char16_t(aChar + 1), lastElement));
}

void InitializeBlocklist(nsTArray<BlocklistRange>& aBlocklist) {
  aBlocklist.Clear();
  for (auto const& arr : sBlocklistPairs) {
    // The hardcoded pairs are already sorted.
    aBlocklist.AppendElement(std::make_pair(arr[0], arr[1]));
  }
}

}  // namespace net
}  // namespace mozilla
