package com.smartxerox.admin.ui.navigation

sealed class Screen(val route: String, val title: String) {
    object Dashboard : Screen("dashboard", "Dashboard")
    object Orders : Screen("orders", "Orders")
    object DeskPrinting : Screen("desk_printing", "Desk Printing")
    object Scanner : Screen("scanner", "Scanner Console")
    object Inventory : Screen("inventory", "Paper Inventory")
    object Settings : Screen("settings", "Settings & Rates")
    object History : Screen("history", "History & Reports")
}
