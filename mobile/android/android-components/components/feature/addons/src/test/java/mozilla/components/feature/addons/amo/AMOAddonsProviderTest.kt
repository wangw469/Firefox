/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.feature.addons.amo

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import mozilla.components.concept.fetch.Client
import mozilla.components.concept.fetch.Request
import mozilla.components.concept.fetch.Response
import mozilla.components.feature.addons.Addon
import mozilla.components.support.test.any
import mozilla.components.support.test.file.loadResourceAsString
import mozilla.components.support.test.mock
import mozilla.components.support.test.robolectric.testContext
import mozilla.components.support.test.rule.MainCoroutineRule
import mozilla.components.support.test.whenever
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.never
import org.mockito.Mockito.spy
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.Date
import java.util.concurrent.TimeUnit

@ExperimentalCoroutinesApi
@RunWith(AndroidJUnit4::class)
class AMOAddonsProviderTest {

    @get:Rule
    val coroutinesTestRule = MainCoroutineRule()
    private val dispatcher = coroutinesTestRule.testDispatcher

    @Test
    fun `getFeaturedAddons - with a successful status response must contain add-ons`() = runTest {
        val mockedClient = prepareClient(loadResourceAsString("/collection.json"))
        val provider = AMOAddonsProvider(testContext, client = mockedClient, ioDispatcher = dispatcher)
        val addons = provider.getFeaturedAddons()
        val addon = addons.first()

        assertTrue(addons.isNotEmpty())
        assertAddonIsUBlockOrigin(addon)
    }

    @Test
    fun `getFeaturedAddons - with a successful status response must handle empty values`() = runTest {
        val client = prepareClient()
        val provider = AMOAddonsProvider(testContext, client = client, ioDispatcher = dispatcher)

        val addons = provider.getFeaturedAddons()
        val addon = addons.first()

        assertTrue(addons.isNotEmpty())

        // Add-on
        assertEquals("", addon.id)
        assertEquals("", addon.createdAt)
        assertEquals("", addon.updatedAt)
        assertEquals("", addon.iconUrl)
        assertEquals("", addon.homepageUrl)
        assertEquals("", addon.version)
        assertEquals("", addon.downloadUrl)
        assertTrue(addon.permissions.isEmpty())
        assertTrue(addon.translatableName.isEmpty())
        assertTrue(addon.translatableSummary.isEmpty())
        assertEquals("", addon.translatableDescription.getValue("ca"))
        assertEquals(Addon.DEFAULT_LOCALE, addon.defaultLocale)
        assertEquals("", addon.detailUrl)

        // Author
        assertNull(addon.author)
        verify(client).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/" +
                    "7e8d6dc651b54ab385fb8791bf9dac/addons/?page_size=$PAGE_SIZE&sort=${SortOption.POPULARITY_DESC.value}",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        // Ratings
        assertNull(addon.rating)
    }

    @Test
    fun `getFeaturedAddons - with a language`() = runTest {
        val client = prepareClient(loadResourceAsString("/localized_collection.json"))
        val provider = AMOAddonsProvider(testContext, client = client, ioDispatcher = dispatcher)

        val addons = provider.getFeaturedAddons(language = "en")
        val addon = addons.first()

        assertTrue(addons.isNotEmpty())

        // Add-on
        assertEquals("uBlock0@raymondhill.net", addon.id)
        assertEquals("2015-04-25T07:26:22Z", addon.createdAt)
        assertEquals("2021-02-01T14:04:16Z", addon.updatedAt)
        assertEquals(
            "https://addons.cdn.mozilla.net/user-media/addon_icons/607/607454-64.png?modified=mcrushed",
            addon.iconUrl,
        )
        assertEquals(
            "https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/",
            addon.homepageUrl,
        )
        assertEquals(
            "https://addons.mozilla.org/firefox/downloads/file/3719054/ublock_origin-1.33.2-an+fx.xpi",
            addon.downloadUrl,
        )
        assertEquals(
            "dns",
            addon.permissions.first(),
        )
        assertEquals(
            "uBlock Origin",
            addon.translatableName["en"],
        )

        assertEquals(
            "Finally, an efficient wide-spectrum content blocker. Easy on CPU and memory.",
            addon.translatableSummary["en"],
        )

        assertTrue(addon.translatableDescription.getValue("en").isNotBlank())
        assertEquals("1.33.2", addon.version)
        assertEquals("en", addon.defaultLocale)

        // Author
        assertEquals("Raymond Hill", addon.author?.name)
        assertEquals(
            "https://addons.mozilla.org/en-US/firefox/user/11423598/",
            addon.author?.url,
        )

        // Ratings
        assertEquals(4.7003F, addon.rating!!.average, 0.7003F)
        assertEquals(4433, addon.rating!!.reviews)

        verify(client).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/" +
                    "7e8d6dc651b54ab385fb8791bf9dac/addons/?page_size=$PAGE_SIZE&sort=${SortOption.POPULARITY_DESC.value}&lang=en",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        Unit
    }

    @Test
    fun `getFeaturedAddons - read timeout can be configured`() = runTest {
        val mockedClient = prepareClient()

        val provider = spy(AMOAddonsProvider(testContext, client = mockedClient, ioDispatcher = dispatcher))
        provider.getFeaturedAddons(readTimeoutInSeconds = 5)
        verify(mockedClient).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/" +
                    "7e8d6dc651b54ab385fb8791bf9dac/addons/?page_size=$PAGE_SIZE&sort=${SortOption.POPULARITY_DESC.value}",
                readTimeout = Pair(5, TimeUnit.SECONDS),
                conservative = true,
            ),
        )
        Unit
    }

    @Test(expected = IOException::class)
    fun `getFeaturedAddons - with unexpected status will throw exception`() = runTest {
        val mockedClient = prepareClient(status = 500)
        val provider = AMOAddonsProvider(testContext, client = mockedClient, ioDispatcher = dispatcher)
        provider.getFeaturedAddons()
        Unit
    }

    @Test
    fun `getFeaturedAddons - returns cached result if allowed and not expired`() = runTest {
        val mockedClient = prepareClient(loadResourceAsString("/collection.json"))

        val provider = spy(AMOAddonsProvider(testContext, client = mockedClient, ioDispatcher = dispatcher))
        provider.getFeaturedAddons(false)
        verify(provider, never()).readFromDiskCache(null, useFallbackFile = false)

        whenever(provider.cacheExpired(testContext, null, useFallbackFile = false)).thenReturn(true)
        provider.getFeaturedAddons(true)
        verify(provider, never()).readFromDiskCache(null, useFallbackFile = false)

        whenever(provider.cacheExpired(testContext, null, useFallbackFile = false)).thenReturn(false)
        provider.getFeaturedAddons(true)
        verify(provider).readFromDiskCache(null, useFallbackFile = false)
        Unit
    }

    @Test
    fun `getFeaturedAddons - returns cached result if allowed and fetch failed`() = runTest {
        val mockedClient: Client = mock()
        val exception = IOException("test")
        val cachedAddons: List<Addon> = emptyList()
        whenever(mockedClient.fetch(any())).thenThrow(exception)

        val provider = spy(AMOAddonsProvider(testContext, client = mockedClient, ioDispatcher = dispatcher))

        try {
            // allowCache = false
            provider.getFeaturedAddons(allowCache = false)
            fail("Expected IOException")
        } catch (e: IOException) {
            assertEquals("test", e.message)
        }

        try {
            // allowCache = true, but no cache present
            provider.getFeaturedAddons(allowCache = true)
            fail("Expected IOException")
        } catch (error: IOException) {
            assertEquals("test", error.message)
        }

        try {
            // allowCache = true, cache present, but we fail to read
            whenever(provider.getCacheLastUpdated(testContext, null, useFallbackFile = false)).thenReturn(Date().time)
            provider.getFeaturedAddons(allowCache = true)
            fail("Expected IOException")
        } catch (error: IOException) {
            assertEquals("test", error.message)
        }

        // allowCache = true, cache present for a fallback file, and reading successfully
        whenever(provider.getCacheLastUpdated(testContext, null, useFallbackFile = true)).thenReturn(Date().time)
        whenever(provider.readFromDiskCache(null, useFallbackFile = true)).thenReturn(cachedAddons)
        assertSame(cachedAddons, provider.getFeaturedAddons(allowCache = true))

        // allowCache = true, cache present, and reading successfully
        whenever(provider.getCacheLastUpdated(testContext, null, useFallbackFile = false)).thenReturn(Date().time)
        whenever(provider.cacheExpired(testContext, null, useFallbackFile = false)).thenReturn(false)
        whenever(provider.readFromDiskCache(null, useFallbackFile = false)).thenReturn(cachedAddons)
        whenever(provider.readFromDiskCache(null, useFallbackFile = false)).thenReturn(cachedAddons)
        assertEquals(cachedAddons, provider.getFeaturedAddons(allowCache = true))
    }

    @Test
    fun `getFeaturedAddons - writes response to cache if configured`() = runTest {
        val jsonResponse = loadResourceAsString("/collection.json")
        val mockedClient = prepareClient(jsonResponse)

        val provider = spy(AMOAddonsProvider(testContext, client = mockedClient, ioDispatcher = dispatcher))
        val cachingProvider = spy(AMOAddonsProvider(testContext, client = mockedClient, maxCacheAgeInMinutes = 1, ioDispatcher = dispatcher))

        provider.getFeaturedAddons()
        verify(provider, never()).writeToDiskCache(jsonResponse, null)

        cachingProvider.getFeaturedAddons()
        verify(cachingProvider).writeToDiskCache(jsonResponse, null)
    }

    @Test
    fun `getFeaturedAddons - deletes unused cache files`() = runTest {
        val jsonResponse = loadResourceAsString("/collection.json")
        val mockedClient = prepareClient(jsonResponse)

        val provider = spy(AMOAddonsProvider(testContext, client = mockedClient, maxCacheAgeInMinutes = 1, ioDispatcher = dispatcher))

        provider.getFeaturedAddons()
        verify(provider).deleteUnusedCacheFiles(null)
    }

    @Test
    fun `deleteUnusedCacheFiles - only deletes collection cache files`() {
        val regularFile = File(testContext.filesDir, "test.json")
        regularFile.createNewFile()
        assertTrue(regularFile.exists())

        val regularDir = File(testContext.filesDir, "testDir")
        regularDir.mkdir()
        assertTrue(regularDir.exists())

        val collectionFile = File(testContext.filesDir, COLLECTION_FILE_NAME.format("testCollection"))
        collectionFile.createNewFile()
        assertTrue(collectionFile.exists())

        val provider = AMOAddonsProvider(testContext, client = prepareClient(), maxCacheAgeInMinutes = 1, ioDispatcher = dispatcher)
        provider.deleteUnusedCacheFiles(null)
        assertTrue(regularFile.exists())
        assertTrue(regularDir.exists())
        assertFalse(collectionFile.exists())
    }

    @Test
    fun `deleteUnusedCacheFiles - will not remove the fallback localized file`() {
        val regularFile = File(testContext.filesDir, "test.json")
        regularFile.createNewFile()
        assertTrue(regularFile.exists())

        val regularDir = File(testContext.filesDir, "testDir")
        regularDir.mkdir()
        assertTrue(regularDir.exists())

        val provider = AMOAddonsProvider(testContext, client = prepareClient(), maxCacheAgeInMinutes = 1, ioDispatcher = dispatcher)
        val enFile = File(testContext.filesDir, provider.getCacheFileName("en"))

        enFile.createNewFile()

        assertTrue(enFile.exists())

        provider.deleteUnusedCacheFiles("es")

        val file = provider.getBaseCacheFile(testContext, "es", useFallbackFile = true)

        assertTrue(file.name.contains("en"))
        assertTrue(file.exists())
        assertEquals(enFile.name, file.name)
        assertTrue(regularFile.exists())
        assertTrue(regularDir.exists())
        assertTrue(enFile.delete())
        assertFalse(file.exists())
        assertTrue(regularFile.delete())
        assertTrue(regularDir.delete())
    }

    @Test
    fun `getBaseCacheFile - will return a first localized file WHEN the provided language file is not available`() {
        val provider = AMOAddonsProvider(testContext, client = prepareClient(), maxCacheAgeInMinutes = 1, ioDispatcher = dispatcher)
        val enFile = File(testContext.filesDir, provider.getCacheFileName("en"))

        enFile.createNewFile()

        assertTrue(enFile.exists())

        val file = provider.getBaseCacheFile(testContext, "es", useFallbackFile = true)

        assertTrue(file.name.contains("en"))
        assertTrue(file.exists())
        assertEquals(enFile.name, file.name)

        assertTrue(enFile.delete())
        assertFalse(file.exists())
    }

    @Test
    fun `getFeaturedAddons - cache expiration check`() {
        var provider = spy(AMOAddonsProvider(testContext, client = mock(), maxCacheAgeInMinutes = -1, ioDispatcher = dispatcher))
        whenever(provider.getCacheLastUpdated(testContext, null, useFallbackFile = false)).thenReturn(Date().time)
        assertTrue(provider.cacheExpired(testContext, null, useFallbackFile = false))

        whenever(provider.getCacheLastUpdated(testContext, null, useFallbackFile = false)).thenReturn(-1)
        assertTrue(provider.cacheExpired(testContext, null, useFallbackFile = false))

        provider = spy(AMOAddonsProvider(testContext, client = mock(), maxCacheAgeInMinutes = 10, ioDispatcher = dispatcher))
        whenever(provider.getCacheLastUpdated(testContext, null, useFallbackFile = false)).thenReturn(-1)
        assertTrue(provider.cacheExpired(testContext, null, useFallbackFile = false))

        whenever(provider.getCacheLastUpdated(testContext, null, useFallbackFile = false)).thenReturn(Date().time - 60 * MINUTE_IN_MS)
        assertTrue(provider.cacheExpired(testContext, null, useFallbackFile = false))

        whenever(provider.getCacheLastUpdated(testContext, null, useFallbackFile = false)).thenReturn(Date().time + 60 * MINUTE_IN_MS)
        assertFalse(provider.cacheExpired(testContext, null, useFallbackFile = false))
    }

    @Test
    fun `loadIconAsync - with a successful status will return a bitmap`() = runTest {
        val mockedClient = mock<Client>()
        val mockedResponse = mock<Response>()
        val stream: InputStream = javaClass.getResourceAsStream("/png/mozac.png")!!.buffered()
        val responseBody = Response.Body(stream)

        whenever(mockedResponse.body).thenReturn(responseBody)
        whenever(mockedResponse.status).thenReturn(200)
        whenever(mockedClient.fetch(any())).thenReturn(mockedResponse)

        val provider = AMOAddonsProvider(testContext, client = mockedClient, ioDispatcher = dispatcher)

        val bitmap = provider.loadIconAsync("id", "https://example.com/image.png").await()
        assertTrue(bitmap is Bitmap)
    }

    @Test
    fun `loadIconAsync - will return bitmap from the cache when available`() = runTest {
        val mockedClient = mock<Client>()
        val expectedIcon = mock<Bitmap>()

        val provider = AMOAddonsProvider(testContext, client = mockedClient, ioDispatcher = dispatcher)

        provider.iconsCache["id"] = expectedIcon

        val bitmap = provider.loadIconAsync("id", "https://example.com/image.png").await()

        verify(mockedClient, times(0)).fetch(any())
        assertEquals(expectedIcon, bitmap)
        assertTrue(bitmap is Bitmap)
    }

    @Test
    fun `loadIconAsync - with an unsuccessful status will return null`() = runTest {
        val mockedClient = prepareClient(status = 500)
        val provider = AMOAddonsProvider(testContext, client = mockedClient, ioDispatcher = dispatcher)

        val bitmap = provider.loadIconAsync("id", "https://example.com/image.png").await()
        assertNull(bitmap)
    }

    @Test
    fun `collection name can be configured`() = runTest {
        val mockedClient = prepareClient()

        val collectionName = "collection123"
        val provider = AMOAddonsProvider(
            testContext,
            client = mockedClient,
            collectionName = collectionName,
            ioDispatcher = dispatcher,
        )

        provider.getFeaturedAddons()
        verify(mockedClient).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/" +
                    "$collectionName/addons/?page_size=$PAGE_SIZE&sort=${SortOption.POPULARITY_DESC.value}",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        assertEquals(COLLECTION_FILE_NAME.format(collectionName), provider.getCacheFileName())
    }

    @Test
    fun `collection sort option can be specified`() = runTest {
        val mockedClient = prepareClient()

        val collectionName = "collection123"
        AMOAddonsProvider(
            testContext,
            client = mockedClient,
            collectionName = collectionName,
            sortOption = SortOption.POPULARITY,
            ioDispatcher = dispatcher,
        ).also {
            it.getFeaturedAddons()
        }

        verify(mockedClient).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/" +
                    "$collectionName/addons/?page_size=$PAGE_SIZE&sort=${SortOption.POPULARITY.value}",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        AMOAddonsProvider(
            testContext,
            client = mockedClient,
            collectionName = collectionName,
            sortOption = SortOption.POPULARITY_DESC,
            ioDispatcher = dispatcher,
        ).also {
            it.getFeaturedAddons()
        }

        verify(mockedClient).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/" +
                    "$collectionName/addons/?page_size=$PAGE_SIZE&sort=${SortOption.POPULARITY_DESC.value}",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        AMOAddonsProvider(
            testContext,
            client = mockedClient,
            collectionName = collectionName,
            sortOption = SortOption.NAME,
            ioDispatcher = dispatcher,
        ).also {
            it.getFeaturedAddons()
        }

        verify(mockedClient).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/" +
                    "$collectionName/addons/?page_size=$PAGE_SIZE&sort=${SortOption.NAME.value}",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        AMOAddonsProvider(
            testContext,
            client = mockedClient,
            collectionName = collectionName,
            sortOption = SortOption.NAME_DESC,
            ioDispatcher = dispatcher,
        ).also {
            it.getFeaturedAddons()
        }

        verify(mockedClient).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/" +
                    "$collectionName/addons/?page_size=$PAGE_SIZE&sort=${SortOption.NAME_DESC.value}",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        AMOAddonsProvider(
            testContext,
            client = mockedClient,
            collectionName = collectionName,
            sortOption = SortOption.DATE_ADDED,
            ioDispatcher = dispatcher,
        ).also {
            it.getFeaturedAddons()
        }

        verify(mockedClient).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/" +
                    "$collectionName/addons/?page_size=$PAGE_SIZE&sort=${SortOption.DATE_ADDED.value}",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        AMOAddonsProvider(
            testContext,
            client = mockedClient,
            collectionName = collectionName,
            sortOption = SortOption.DATE_ADDED_DESC,
            ioDispatcher = dispatcher,
        ).also {
            it.getFeaturedAddons()
        }

        verify(mockedClient).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/mozilla/collections/" +
                    "$collectionName/addons/?page_size=$PAGE_SIZE&sort=${SortOption.DATE_ADDED_DESC.value}",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        Unit
    }

    @Test
    fun `collection user can be configured`() = runTest {
        val mockedClient = prepareClient()
        val collectionUser = "user123"
        val collectionName = "collection123"
        val provider = AMOAddonsProvider(
            testContext,
            client = mockedClient,
            collectionUser = collectionUser,
            collectionName = collectionName,
            ioDispatcher = dispatcher,
        )

        provider.getFeaturedAddons()
        verify(mockedClient).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/" +
                    "$collectionUser/collections/$collectionName/addons/" +
                    "?page_size=$PAGE_SIZE" +
                    "&sort=${SortOption.POPULARITY_DESC.value}",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        assertEquals(
            COLLECTION_FILE_NAME.format("${collectionUser}_$collectionName"),
            provider.getCacheFileName(),
        )
    }

    @Test
    fun `default collection is used if not configured`() = runTest {
        val mockedClient = prepareClient()

        val provider = AMOAddonsProvider(
            testContext,
            client = mockedClient,
            ioDispatcher = dispatcher,
        )

        provider.getFeaturedAddons()
        verify(mockedClient).fetch(
            Request(
                url = "https://services.addons.mozilla.org/api/v4/accounts/account/" +
                    "$DEFAULT_COLLECTION_USER/collections/$DEFAULT_COLLECTION_NAME/addons/" +
                    "?page_size=$PAGE_SIZE" +
                    "&sort=${SortOption.POPULARITY_DESC.value}",
                readTimeout = Pair(DEFAULT_READ_TIMEOUT_IN_SECONDS, TimeUnit.SECONDS),
                conservative = true,
            ),
        )

        assertEquals(COLLECTION_FILE_NAME.format(DEFAULT_COLLECTION_NAME), provider.getCacheFileName())
    }

    @Test
    fun `cache file name is sanitized`() = runTest {
        val mockedClient = prepareClient()
        val collectionUser = "../../user"
        val collectionName = "../collection"
        val provider = AMOAddonsProvider(
            testContext,
            client = mockedClient,
            collectionUser = collectionUser,
            collectionName = collectionName,
            ioDispatcher = dispatcher,
        )

        assertEquals(
            COLLECTION_FILE_NAME.format("user_collection"),
            provider.getCacheFileName(),
        )
    }

    private fun assertAddonIsUBlockOrigin(addon: Addon) {
        // Add-on details
        assertEquals("uBlock0@raymondhill.net", addon.id)
        assertEquals("2015-04-25T07:26:22Z", addon.createdAt)
        assertEquals("2023-07-19T23:09:25Z", addon.updatedAt)
        assertEquals(
            "https://addons.mozilla.org/user-media/addon_icons/607/607454-64.png?modified=mcrushed",
            addon.iconUrl,
        )
        assertEquals(
            "https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/",
            addon.homepageUrl,
        )
        assertEquals(
            "https://addons.mozilla.org/firefox/downloads/file/4141256/ublock_origin-1.51.0.xpi",
            addon.downloadUrl,
        )
        assertEquals(
            "dns",
            addon.permissions.first(),
        )
        assertEquals(
            "uBlock Origin",
            addon.translatableName["ca"],
        )
        assertEquals(
            "Finalment, un blocador eficient que utilitza pocs recursos de memòria i processador.",
            addon.translatableSummary["ca"],
        )
        assertTrue(addon.translatableDescription.getValue("ca").isNotBlank())
        assertEquals("1.51.0", addon.version)
        assertEquals("en-us", addon.defaultLocale)
        // Author
        assertEquals("Raymond Hill", addon.author?.name)
        assertEquals(
            "https://addons.mozilla.org/en-US/firefox/user/11423598/",
            addon.author?.url,
        )
        // Ratings
        assertEquals(4.7825F, addon.rating!!.average, 0.7825F)
        assertEquals(4101, addon.rating!!.reviews)
        assertEquals(
            "https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/reviews/",
            addon.ratingUrl,
        )
        assertEquals(
            "https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/",
            addon.detailUrl,
        )
    }

    private fun prepareClient(
        jsonResponse: String = loadResourceAsString("/collection_with_empty_values.json"),
        status: Int = 200,
    ): Client {
        val mockedClient = mock<Client>()
        val mockedResponse = mock<Response>()
        val mockedBody = mock<Response.Body>()
        whenever(mockedBody.string(any())).thenReturn(jsonResponse)
        whenever(mockedResponse.body).thenReturn(mockedBody)
        whenever(mockedResponse.status).thenReturn(status)
        whenever(mockedClient.fetch(any())).thenReturn(mockedResponse)
        return mockedClient
    }
}
