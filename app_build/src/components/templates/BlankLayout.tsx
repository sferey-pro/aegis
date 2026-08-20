import React from "react";
import { Outlet } from "react-router-dom";

export function BlankLayout() {
	return (
		<div className="flex-1 flex flex-col w-full">
			<Outlet />
		</div>
	);
}
