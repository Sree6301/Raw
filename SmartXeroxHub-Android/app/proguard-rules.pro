# Add project specific ProGuard rules here.
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keep class com.smartxerox.admin.data.model.** { *; }
-keep class com.smartxerox.admin.data.local.** { *; }
