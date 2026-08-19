import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

export function Debug() {
	return (
		<div className="w-full max-w-6xl mx-auto p-6 md:p-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
			<div className="mb-10">
				<h1 className="text-4xl font-bold font-heading mb-4">Design System</h1>
				<p className="text-muted-foreground text-lg">
					Laboratoire Atomic Design : Liste des composants fondamentaux (Atomes) utilisés dans l'application Aegis.
				</p>
			</div>

			<div className="flex flex-col gap-12">
				{/* BUTTONS */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">Boutons (Buttons)</h2>
					<div className="flex flex-wrap gap-4 items-center bg-card p-6 rounded-xl border border-border">
						<Button variant="default">Default</Button>
						<Button variant="secondary">Secondary</Button>
						<Button variant="destructive">Destructive</Button>
						<Button variant="outline">Outline</Button>
						<Button variant="ghost">Ghost</Button>
						<Button variant="link">Link</Button>
						<Button disabled>Disabled</Button>
					</div>
				</section>

				{/* BADGES */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">Badges</h2>
					<div className="flex flex-wrap gap-4 items-center bg-card p-6 rounded-xl border border-border">
						<Badge variant="default">Default Badge</Badge>
						<Badge variant="secondary">Secondary Badge</Badge>
						<Badge variant="destructive">Destructive Badge</Badge>
						<Badge variant="outline">Outline Badge</Badge>
					</div>
				</section>

				{/* INPUTS & TEXTAREA */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">Formulaires (Inputs & Textarea)</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-card p-6 rounded-xl border border-border">
						<div className="flex flex-col gap-3">
							<Label htmlFor="email">Email</Label>
							<Input type="email" id="email" placeholder="john@example.com" />
						</div>
						<div className="flex flex-col gap-3">
							<Label htmlFor="disabled">Input Désactivé</Label>
							<Input disabled type="text" id="disabled" placeholder="Non modifiable" />
						</div>
						<div className="flex flex-col gap-3 md:col-span-2">
							<Label htmlFor="message">Message</Label>
							<Textarea id="message" placeholder="Votre message ici..." />
						</div>
					</div>
				</section>

				{/* SELECT */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">Sélection (Select)</h2>
					<div className="bg-card p-6 rounded-xl border border-border max-w-sm">
						<Select>
							<SelectTrigger>
								<SelectValue placeholder="Sélectionnez un rôle" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="admin">Administrateur</SelectItem>
								<SelectItem value="dev">Développeur</SelectItem>
								<SelectItem value="viewer">Observateur</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</section>

				{/* PROGRESS & TOOLTIP */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">Feedback & Tooltips</h2>
					<div className="flex flex-col gap-8 bg-card p-6 rounded-xl border border-border">
						<div className="flex flex-col gap-3">
							<Label>Progression (60%)</Label>
							<Progress value={60} className="w-full max-w-md" />
						</div>
						<div>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button variant="outline">Survolez-moi</Button>
									</TooltipTrigger>
									<TooltipContent>
										<p>Ceci est un composant Tooltip standard.</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
				</section>

				{/* TABS & CARD */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">Conteneurs (Tabs & Cards)</h2>
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
						<Tabs defaultValue="tab1" className="w-full">
							<TabsList className="w-full justify-start">
								<TabsTrigger value="tab1">Onglet 1</TabsTrigger>
								<TabsTrigger value="tab2">Onglet 2</TabsTrigger>
							</TabsList>
							<TabsContent value="tab1" className="p-4 bg-card rounded-xl border border-border mt-2">
								Contenu de l'onglet 1.
							</TabsContent>
							<TabsContent value="tab2" className="p-4 bg-card rounded-xl border border-border mt-2">
								Contenu de l'onglet 2.
							</TabsContent>
						</Tabs>

						<Card>
							<CardHeader>
								<CardTitle>Composant Card</CardTitle>
								<CardDescription>C'est une Molécule courante.</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Les cards permettent de regrouper visuellement des informations associées.
								</p>
							</CardContent>
						</Card>
					</div>
				</section>

				{/* MODALS */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">Modales (Dialog)</h2>
					<div className="flex gap-4 items-center bg-card p-6 rounded-xl border border-border">
						<Dialog>
							<DialogTrigger asChild>
								<Button variant="default">Ouvrir la Modale</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Titre de la Modale</DialogTitle>
									<DialogDescription>
										Ceci est une description standard pour expliquer l'action de la modale.
									</DialogDescription>
								</DialogHeader>
								<div className="py-4 text-sm text-muted-foreground">
									Le contenu de la modale va ici. Les marges et le fond d'écran sont gérés automatiquement par Shadcn.
								</div>
								<div className="flex justify-end gap-2">
									<Button variant="outline">Annuler</Button>
									<Button>Confirmer</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>
				</section>

				{/* TABLE */}
				<section>
					<h2 className="text-2xl font-bold mb-4 border-b pb-2">Tableau (Table)</h2>
					<div className="bg-card rounded-xl border border-border overflow-hidden">
						<Table>
							<TableHeader className="bg-muted/50">
								<TableRow>
									<TableHead>Composant</TableHead>
									<TableHead>Type</TableHead>
									<TableHead className="text-right">Statut</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<TableRow>
									<TableCell className="font-medium">Button</TableCell>
									<TableCell>Atome</TableCell>
									<TableCell className="text-right"><Badge>Clean</Badge></TableCell>
								</TableRow>
								<TableRow>
									<TableCell className="font-medium">Card</TableCell>
									<TableCell>Molécule</TableCell>
									<TableCell className="text-right"><Badge>Clean</Badge></TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</div>
				</section>
			</div>
		</div>
	);
}
