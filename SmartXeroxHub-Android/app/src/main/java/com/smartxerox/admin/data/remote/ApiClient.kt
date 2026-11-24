package com.smartxerox.admin.data.remote

import com.smartxerox.admin.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    private var baseUrl: String = BuildConfig.BACKEND_BASE_URL

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE
    }

    val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .addInterceptor(loggingInterceptor)
        .addInterceptor { chain ->
            val original = chain.request()
            val requestBuilder = original.newBuilder()
                .header("User-Agent", "SmartXeroxHub-Android-Admin/1.0.0")
                .header("Accept", "application/json")
            chain.proceed(requestBuilder.build())
        }
        .build()

    private var retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    var service: SmartXeroxApiService = retrofit.create(SmartXeroxApiService::class.java)
        private set

    fun updateBaseUrl(newUrl: String) {
        val trimmed = if (newUrl.endsWith("/")) newUrl else "$newUrl/"
        baseUrl = trimmed
        retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        service = retrofit.create(SmartXeroxApiService::class.java)
    }

    fun getBaseUrl(): String = baseUrl
}
