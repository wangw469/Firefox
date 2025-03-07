/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::result::{Error, Result};

use goblin::pe;

use super::BuildIdReader;

use log::trace;

impl BuildIdReader {
    pub fn get_build_id_bytes(&mut self, buffer: &[u8], note_name: &str) -> Result<Vec<u8>> {
        trace!("get_build_id_bytes: {}", note_name);

        let pe_head = pe::header::Header::parse(buffer).map_err(|source| Error::Goblin {
            action: "parse PE buffer",
            source,
        })?;

        trace!("get_build_id_bytes: {:?}", pe_head);

        // Skip the PE header so we can parse the sections
        let optional_header_offset = pe_head.dos_header.pe_pointer as usize
            + pe::header::SIZEOF_PE_MAGIC
            + pe::header::SIZEOF_COFF_HEADER;

        let sections_offset =
            optional_header_offset + pe_head.coff_header.size_of_optional_header as usize;
        let sections_size = pe_head.coff_header.number_of_sections as usize
            * goblin::pe::section_table::SIZEOF_SECTION_TABLE;
        let sections_bytes = self.copy_bytes(sections_offset, sections_size)?;
        trace!("get_build_id_bytes: {:?}", sections_bytes);

        let pe_sections = pe_head
            .coff_header
            .sections(&sections_bytes, &mut 0)
            .map_err(|source| Error::Goblin {
                action: "get PE sections",
                source,
            })?;
        trace!("get_build_id_bytes: {:?}", pe_sections);

        let pe_section = pe_sections
            .iter()
            .find(|s| s.name().is_ok_and(|name| name == note_name))
            .ok_or(Error::NoteNotAvailable)?;
        trace!("get_build_id_bytes: {:?}", pe_section);

        self.copy_bytes(
            pe_section.pointer_to_raw_data as usize,
            pe_section.virtual_size as usize,
        )
    }
}
