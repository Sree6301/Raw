package com.smartxerox.admin.data.remote

import com.smartxerox.admin.BuildConfig

object SupabaseConfig {
    const val URL = BuildConfig.SUPABASE_URL
    const val ANON_KEY = BuildConfig.SUPABASE_ANON_KEY
    const val REST_URL = "$URL/rest/v1"
    const val STORAGE_URL = "$URL/storage/v1"
}
